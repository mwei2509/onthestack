import type { GameAction } from './actions.js';
import type { AbilityDefinition, EffectTemplate, InterveningIf, ObjectFilter, TriggerCondition, TriggeredAbility } from './cards.js';
import type { GameEvent } from './events.js';
import type { AbilityId, CardName, ObjectId, PlayerId } from './ids.js';
import type { GameState, PendingTrigger, Permanent, StackItem } from './state.js';

const triggered = (abilities: AbilityDefinition[] | undefined): TriggeredAbility[] =>
  (abilities ?? []).filter((a): a is TriggeredAbility => a.kind === 'triggered');

/**
 * Finds every triggered ability that matches a GameEvent. Called with the state before the event for things leaving
 * the battlefield (so "when this dies" still sees it, CR 603.10) and after the event for everything else.
 */
export function scanTriggers(state: GameState, event: GameEvent): PendingTrigger[] {
  const found: PendingTrigger[] = [];
  for (const source of Object.values(state.permanents)) {
    const def = state.cards[source.card];
    for (const ability of triggered(def?.abilities)) {
      if (ability.if && !conditionHolds(state, ability.if, source.controllerId)) continue;
      for (const matched of matches(ability.when, event, source, state)) {
        found.push({
          ability: ability.id,
          controllerId: source.controllerId,
          source: { card: source.card, permanentId: source.id, lastKnown: { card: source.card, controllerId: source.controllerId } },
          triggeredBy: event.id,
          matched,
        });
      }
    }
  }
  return found;
}

/** Whether the GameEvent leaves the battlefield, so its trigger scan must look at the state before it. */
export const looksBack = (event: GameEvent): boolean => event.type === 'ZoneChanged' && event.from === 'battlefield';

function matches(when: TriggerCondition, event: GameEvent, source: Permanent, state: GameState): Record<string, ObjectId | PlayerId>[] {
  if (when.event !== event.type) return [];
  const you = source.controllerId;
  const relation = (playerId: PlayerId, rel: 'you' | 'opponent' | 'any' | undefined) =>
    rel === undefined || rel === 'any' || (rel === 'you' ? playerId === you : playerId !== you);

  switch (event.type) {
    case 'ZoneChanged': {
      if (when.to && when.to !== event.to) return [];
      if (when.from && when.from !== event.from) return [];
      return event.moves
        .filter((m) => {
          if (!m.objectId) return false;
          const controllerId = state.permanents[m.objectId]?.controllerId ?? m.controllerId ?? m.ownerId;
          return objectMatches(when.object, m.objectId, m.card, controllerId, source, state);
        })
        .map((m) => ({ object: m.objectId! }));
    }
    case 'PhaseStarted':
      if (when.step && when.step !== event.step) return [];
      return relation(event.activePlayerId, when.whose) ? [{}] : [];
    case 'AttackersDeclared':
      return event.attacks
        .filter((a) => (when.includes === 'self' ? a.attackerId === source.id : true))
        .map((a) => ({ attacker: a.attackerId, defendingPlayer: a.target }));
    case 'LifeChanged':
      if (when.gained && event.delta <= 0) return [];
      return relation(event.playerId, when.player) ? [{ player: event.playerId }] : [];
    case 'DamageDealt': {
      // Only damage to players matches, once per source and player even when the batch holds more than one item.
      const seen = new Set<string>();
      const found: Record<string, ObjectId | PlayerId>[] = [];
      for (const d of event.damage) {
        if (!('playerId' in d.recipient) || d.amount <= 0 || (when.combat && !d.combat)) continue;
        const playerId = d.recipient.playerId;
        const dealer = state.permanents[d.sourceId];
        if (!dealer || !relation(playerId, when.player)) continue;
        if (!objectMatches(when.object, dealer.id, dealer.card, dealer.controllerId, source, state)) continue;
        const key = `${dealer.id}>${playerId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ source: dealer.id, defendingPlayer: playerId });
      }
      return found;
    }
    case 'SpellCast':
      if (!relation(event.casterId, when.player)) return [];
      return objectMatches(when.object, event.stackItemId, event.card, event.casterId, source, state) ? [{ spell: event.stackItemId }] : [];
    default:
      return [];
  }
}

function objectMatches(
  filter: TriggerCondition['object'],
  objectId: ObjectId,
  card: CardName,
  controllerId: PlayerId,
  source: Permanent,
  state: GameState,
): boolean {
  if (filter === undefined) return true;
  if (filter === 'self') return objectId === source.id;
  if ('selfOr' in filter) return objectId === source.id || filterMatches(filter.selfOr, objectId, card, controllerId, source.controllerId, state);
  if (filter.other && objectId === source.id) return false;
  return filterMatches(filter, objectId, card, controllerId, source.controllerId, state);
}

function filterMatches(filter: ObjectFilter, _objectId: ObjectId, card: CardName, controllerId: PlayerId, you: PlayerId, state: GameState): boolean {
  const def = state.cards[card];
  if (filter.types && !filter.types.some((t) => def?.types.includes(t))) return false;
  if (filter.controller === 'you' && controllerId !== you) return false;
  if (filter.controller === 'opponent' && controllerId === you) return false;
  if (filter.manaValue?.atMost !== undefined && (def?.manaValue ?? 0) > filter.manaValue.atMost) return false;
  if (filter.manaValue?.atLeast !== undefined && (def?.manaValue ?? 0) < filter.manaValue.atLeast) return false;
  return true;
}

/** Intervening-if conditions are checked when an ability triggers and again when it resolves (CR 603.4). */
export function conditionHolds(state: GameState, condition: InterveningIf, controllerId: PlayerId): boolean {
  if (condition.lifeGainedThisTurn) {
    const gained = state.gameEventsThisTurn
      .filter((e) => e.type === 'LifeChanged' && e.playerId === controllerId && e.delta > 0)
      .reduce((n, e) => n + (e.type === 'LifeChanged' ? e.delta : 0), 0);
    if (gained < condition.lifeGainedThisTurn.atLeast) return false;
  }
  return true;
}

export function findAbility(state: GameState, card: CardName, abilityId: AbilityId | undefined): AbilityDefinition | undefined {
  return state.cards[card]?.abilities.find((a) => a.id === abilityId);
}

/** Puts waiting triggers in APNAP order: the active player's first, so they sit lowest and resolve last (CR 603.3b). */
export function apnapOrder(state: GameState, pending: PendingTrigger[]): PendingTrigger[] {
  const order = state.turnOrder;
  const start = order.indexOf(state.turn.activePlayerId);
  const rank = (p: PlayerId) => (order.indexOf(p) - start + order.length) % order.length;
  return pending.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.controllerId) - rank(b.t.controllerId) || a.i - b.i).map(({ t }) => t);
}

/** Fills an ability's effect templates with real players and objects: "you", the source, the defending player. */
export function fillTemplates(state: GameState, trigger: PendingTrigger, templates: EffectTemplate[]): GameAction[] {
  const you = trigger.controllerId;
  const sourceId = trigger.source.permanentId;
  const actions: GameAction[] = [];
  for (const t of templates) {
    if ('playerTask' in t) {
      const playerId = t.who === 'defendingPlayer' ? String(trigger.matched.defendingPlayer ?? you) : you;
      actions.push({ type: 'playerTask', playerId, text: `${trigger.source.card}: ${t.playerTask}` });
      continue;
    }
    switch (t.gameAction) {
      case 'life':
        if (t.who === 'you') actions.push({ type: 'life', playerId: you, delta: t.delta });
        else if (t.who === 'eachOpponent') {
          for (const p of state.turnOrder) if (p !== you && !state.players[p]?.out) actions.push({ type: 'life', playerId: p, delta: t.delta });
        } else {
          actions.push({ type: 'playerTask', playerId: you, text: `${trigger.source.card}: choose a player to ${t.delta > 0 ? 'gain' : 'lose'} ${Math.abs(t.delta)} life, and say who.` });
        }
        break;
      case 'move':
        if (t.object === 'self' && sourceId) actions.push({ type: 'move', objectId: sourceId, to: t.to, how: t.how });
        else actions.push({ type: 'playerTask', playerId: you, text: `${trigger.source.card}: choose what to move to ${t.to}, and say which.` });
        break;
      case 'counters':
        if (t.object === 'self' && sourceId) actions.push({ type: 'counters', target: { permanentId: sourceId }, kind: t.kind, delta: t.delta });
        else actions.push({ type: 'playerTask', playerId: you, text: `${trigger.source.card}: choose what gets ${t.delta} ${t.kind} counter(s), and say which.` });
        break;
    }
  }
  return actions;
}

export function toStackItem(state: GameState, trigger: PendingTrigger, id: string): StackItem {
  const ability = findAbility(state, trigger.source.card, trigger.ability);
  const templates = ability && 'effect' in ability && Array.isArray(ability.effect) ? ability.effect : [];
  return {
    id,
    kind: 'trigger',
    ability: trigger.ability,
    controllerId: trigger.controllerId,
    source: trigger.source,
    triggeredBy: trigger.triggeredBy,
    matched: trigger.matched,
    targets: [],
    gameActions: fillTemplates(state, trigger, templates),
    status: 'pending',
  };
}

/** The static ability, if any, that makes a permanent enter tapped: its own, or another permanent's (Authority of the Consuls). */
export function entersTappedBecause(state: GameState, card: CardName, controllerId: PlayerId, tokenTypes?: string[]): AbilityId | undefined {
  if (tokenTypes && !state.cards[card]) state = { ...state, cards: { ...state.cards, [card]: { name: card, types: tokenTypes, abilities: [] } } };
  for (const a of state.cards[card]?.abilities ?? []) {
    if (a.kind !== 'static' || a.effect.entersTapped !== 'self') continue;
    const limit = a.effect.unless?.yourTurnOfGame.atMost;
    if (limit !== undefined && turnsTaken(state, controllerId) <= limit) continue;
    return a.id;
  }
  for (const p of Object.values(state.permanents)) {
    for (const a of state.cards[p.card]?.abilities ?? []) {
      if (a.kind !== 'static' || a.effect.entersTapped === 'self') continue;
      if (filterMatches(a.effect.entersTapped, '', card, controllerId, p.controllerId, state)) return a.id;
    }
  }
  return undefined;
}

/** How many turns this player has started, counting the current one. */
function turnsTaken(state: GameState, playerId: PlayerId): number {
  const seat = state.turnOrder.indexOf(playerId);
  if (seat < 0 || state.turn.number - 1 < seat) return 0;
  return Math.floor((state.turn.number - 1 - seat) / state.turnOrder.length) + 1;
}
