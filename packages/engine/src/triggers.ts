import type { GameAction } from './actions.js';
import type { AbilityDefinition, AbilityZone, Condition, EffectTemplate, ObjectFilter, Range, TriggerCondition, TriggeredAbility } from './cards.js';
import type { GameEvent } from './events.js';
import type { AbilityId, CardName, ObjectId, PermanentId, PlayerId } from './ids.js';
import type { GameState, PendingTrigger, Permanent, StackItem } from './state.js';
import { stats } from './stats.js';

const triggered = (abilities: AbilityDefinition[] | undefined): TriggeredAbility[] =>
  (abilities ?? []).filter((a): a is TriggeredAbility => a.kind === 'triggered');

/** A card whose abilities might trigger: a permanent, or a card in a graveyard or the command zone. */
interface Source {
  card: CardName;
  controllerId: PlayerId;
  zone: AbilityZone;
  permanent?: Permanent;
}

/** An object a filter is checked against. */
interface Candidate {
  id: ObjectId;
  card: CardName;
  controllerId: PlayerId;
  permanent?: Permanent;
  isToken?: boolean;
}

function sources(state: GameState): Source[] {
  const found: Source[] = Object.values(state.permanents).map((p) => ({ card: p.card, controllerId: p.controllerId, zone: 'battlefield', permanent: p }));
  for (const [ownerId, cards] of Object.entries(state.graveyards)) for (const card of cards) found.push({ card, controllerId: ownerId, zone: 'graveyard' });
  for (const [ownerId, cz] of Object.entries(state.commandZone)) if (cz?.inZone) found.push({ card: cz.card, controllerId: ownerId, zone: 'command' });
  return found;
}

/**
 * Finds every triggered ability that matches a GameEvent. Called with the state before the event for things leaving
 * the battlefield (so "when this dies" still sees it, CR 603.10) and after the event for everything else.
 */
export function scanTriggers(state: GameState, event: GameEvent): PendingTrigger[] {
  const found: PendingTrigger[] = [];
  for (const source of sources(state)) {
    for (const ability of triggered(state.cards[source.card]?.abilities)) {
      if ((ability.zone ?? 'battlefield') !== source.zone) continue;
      if (ability.if && !conditionHolds(state, ability.if, source.controllerId)) continue;
      if (ability.condition && !conditionHolds(state, ability.condition, source.controllerId)) continue;
      const whens = Array.isArray(ability.when) ? ability.when : [ability.when];
      for (const matched of whens.flatMap((when) => matches(when, event, source, state))) {
        if (ability.limit && timesTriggeredThisTurn(state, found, ability.id, source) >= ability.limit.perTurn) break;
        found.push({
          ability: ability.id,
          controllerId: source.controllerId,
          source: {
            card: source.card,
            ...(source.permanent ? { permanentId: source.permanent.id } : {}),
            lastKnown: { card: source.card, controllerId: source.controllerId },
          },
          triggeredBy: event.id,
          matched,
        });
      }
    }
  }
  return found;
}

function timesTriggeredThisTurn(state: GameState, found: PendingTrigger[], ability: AbilityId, source: Source): number {
  const same = (t: { ability?: AbilityId; source: { card: CardName; permanentId?: PermanentId } }) =>
    t.ability === ability && t.source.card === source.card && t.source.permanentId === source.permanent?.id;
  const stacked = state.gameEventsThisTurn.filter((e) => e.type === 'AbilityTriggered' && same(e.stackItem)).length;
  return stacked + state.pendingTriggers.filter(same).length + found.filter(same).length;
}

/** Whether the GameEvent leaves the battlefield, so its trigger scan must look at the state before it. */
export const looksBack = (event: GameEvent): boolean => event.type === 'ZoneChanged' && event.from === 'battlefield';

function matches(when: TriggerCondition, event: GameEvent, source: Source, state: GameState): Record<string, ObjectId | PlayerId>[] {
  if (when.event !== event.type) return [];
  const you = source.controllerId;
  const relation = (playerId: PlayerId, rel: 'you' | 'opponent' | 'any' | undefined) =>
    rel === undefined || rel === 'any' || (rel === 'you' ? playerId === you : playerId !== you);
  const onBattlefield = (id: ObjectId): Candidate | undefined => {
    const p = state.permanents[id];
    return p && { id, card: p.card, controllerId: p.controllerId, permanent: p, isToken: p.isToken };
  };

  switch (event.type) {
    case 'ZoneChanged': {
      if (when.to && when.to !== event.to) return [];
      if (when.from && when.from !== event.from) return [];
      return event.moves
        .filter((m) => {
          if (!m.objectId) return false;
          const permanent = state.permanents[m.objectId];
          const controllerId = permanent?.controllerId ?? m.controllerId ?? m.ownerId;
          const isToken = m.isToken ?? permanent?.isToken;
          return objectMatches(when.object, { id: m.objectId, card: m.card, controllerId, ...(permanent ? { permanent } : {}), ...(isToken !== undefined ? { isToken } : {}) }, source, state);
        })
        .map((m) => ({ object: m.objectId! }));
    }
    case 'PhaseStarted':
      if (when.step && when.step !== event.step) return [];
      return relation(event.activePlayerId, when.whose) ? [{}] : [];
    case 'AttackersDeclared':
      return event.attacks
        .filter((a) => {
          if (when.object === undefined) return true;
          const attacker = onBattlefield(a.attackerId);
          return attacker !== undefined && objectMatches(when.object, attacker, source, state);
        })
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
        const dealer = onBattlefield(d.sourceId);
        if (!dealer || !relation(playerId, when.player)) continue;
        if (!objectMatches(when.object, dealer, source, state)) continue;
        const key = `${dealer.id}>${playerId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ source: dealer.id, defendingPlayer: playerId });
      }
      return found;
    }
    case 'SpellCast':
      if (!relation(event.casterId, when.player)) return [];
      return objectMatches(when.object, { id: event.stackItemId, card: event.card, controllerId: event.casterId }, source, state) ? [{ spell: event.stackItemId }] : [];
    default:
      return [];
  }
}

/** A permanent is itself by ID; a card in a graveyard or the command zone is itself by name. */
const isSelf = (object: Candidate, source: Source) => (source.permanent ? object.id === source.permanent.id : object.card === source.card);

function objectMatches(filter: TriggerCondition['object'], object: Candidate, source: Source, state: GameState): boolean {
  if (filter === undefined) return true;
  if (filter === 'self') return isSelf(object, source);
  if ('selfOr' in filter) return isSelf(object, source) || filterMatches(filter.selfOr, object, source.controllerId, state);
  if (filter.other && isSelf(object, source)) return false;
  return filterMatches(filter, object, source.controllerId, state);
}

const inRange = (n: number, range: Range | undefined) =>
  range === undefined || ((range.atLeast === undefined || n >= range.atLeast) && (range.atMost === undefined || n <= range.atMost));

function filterMatches(filter: ObjectFilter, object: Candidate, you: PlayerId, state: GameState): boolean {
  const def = state.cards[object.card];
  const anyOf = (wanted: string[] | undefined, has: string[] | undefined) => !wanted || wanted.some((w) => has?.includes(w));
  if (!anyOf(filter.types, def?.types)) return false;
  if (!anyOf(filter.subtypes, def?.subtypes)) return false;
  if (!anyOf(filter.colors, def?.colors)) return false;
  if (filter.name !== undefined && object.card !== filter.name) return false;
  if (filter.legendary !== undefined && (def?.legendary ?? false) !== filter.legendary) return false;
  if (filter.token !== undefined && (object.isToken ?? false) !== filter.token) return false;
  if (filter.controller === 'you' && object.controllerId !== you) return false;
  if (filter.controller === 'opponent' && object.controllerId === you) return false;
  if (!inRange(def?.manaValue ?? 0, filter.manaValue)) return false;
  if (filter.power || filter.toughness) {
    const s = object.permanent ? stats(object.permanent, state) : undefined;
    if (s?.ptVaries || (!s && def?.ptVaries)) return false;
    if (!inRange(s?.power ?? def?.power ?? 0, filter.power)) return false;
    if (!inRange(s?.toughness ?? def?.toughness ?? 0, filter.toughness)) return false;
  }
  if (filter.tapped !== undefined && (object.permanent?.tapped ?? false) !== filter.tapped) return false;
  if (filter.attacking !== undefined && (state.combat?.attacks.some((a) => a.attackerId === object.id) ?? false) !== filter.attacking) return false;
  return true;
}

/** Checks a Condition for the ability's controller. Intervening-ifs are checked again on resolution (CR 603.4). */
export function conditionHolds(state: GameState, condition: Condition, controllerId: PlayerId): boolean {
  if (condition.lifeGainedThisTurn) {
    const gained = state.gameEventsThisTurn
      .filter((e) => e.type === 'LifeChanged' && e.playerId === controllerId && e.delta > 0)
      .reduce((n, e) => n + (e.type === 'LifeChanged' ? e.delta : 0), 0);
    if (gained < condition.lifeGainedThisTurn.atLeast) return false;
  }
  if (condition.youControl) {
    const { filter, ...range } = condition.youControl;
    const count = Object.values(state.permanents).filter(
      (p) => p.controllerId === controllerId && filterMatches(filter, { id: p.id, card: p.card, controllerId: p.controllerId, permanent: p, isToken: p.isToken }, controllerId, state),
    ).length;
    if (!inRange(count, range)) return false;
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
      if (a.kind !== 'static' || a.effect.entersTapped === 'self' || (a.zone ?? 'battlefield') !== 'battlefield') continue;
      if (filterMatches(a.effect.entersTapped, { id: '', card, controllerId }, p.controllerId, state)) return a.id;
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
