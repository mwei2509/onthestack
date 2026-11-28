import type { GameAction } from './actions.js';
import type { AbilityDefinition, AbilityZone, Amount, Condition, EffectTemplate, EntersUntappedIf, ObjectFilter, ObjectRef, PlayerRef, Range, TriggerCondition, TriggeredAbility } from './cards.js';
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
  if (condition.opponents) {
    const opponents = state.turnOrder.filter((p) => p !== controllerId && state.players[p] && !state.players[p].out).length;
    if (!inRange(opponents, condition.opponents)) return false;
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

/** What an ability's effect templates need to be filled: who controls it, its source and what its trigger matched. */
type Filling = Pick<PendingTrigger, 'controllerId' | 'source' | 'matched'>;

/**
 * Fills an ability's effect templates with real players, objects and numbers. A blank the engine can't fill (a target
 * nobody has named, an amount it can't count) becomes a PlayerTask asking the controller (ADR 0138). Oracle reminders
 * are collected beside the GameActions.
 */
export function fillTemplates(state: GameState, item: Filling, templates: EffectTemplate[]): { gameActions: GameAction[]; reminders: string[] } {
  const you = item.controllerId;
  const card = item.source.card;
  const ask = (text: string): GameAction => ({ type: 'playerTask', playerId: you, text: `${card}: ${text}` });
  const live = (p: PlayerId) => state.players[p] && !state.players[p].out;

  const players = (ref: PlayerRef): PlayerId[] | undefined => {
    if (ref === 'you') return [you];
    if (ref === 'eachOpponent') return state.turnOrder.filter((p) => p !== you && live(p));
    if (ref === 'eachPlayer') return state.turnOrder.filter(live);
    if (ref === 'defendingPlayer') return item.matched.defendingPlayer !== undefined ? [String(item.matched.defendingPlayer)] : undefined;
    return undefined;
  };
  const object = (ref: ObjectRef): ObjectId | undefined => {
    if (ref === 'self') return item.source.permanentId;
    if (ref === 'matched') return item.matched.object ?? item.matched.attacker ?? item.matched.source ?? item.matched.spell;
    return undefined;
  };
  const amount = (a: Amount): number | undefined => {
    if (typeof a === 'number') return a;
    if ('count' in a) {
      return Object.values(state.permanents).filter((p) => filterMatches(a.count, { id: p.id, card: p.card, controllerId: p.controllerId, permanent: p, isToken: p.isToken }, you, state)).length;
    }
    if ('powerOf' in a && a.powerOf !== 'target') {
      const id = object(a.powerOf);
      const p = id ? state.permanents[id] : undefined;
      if (!p) return undefined;
      const s = stats(p, state);
      return s.ptVaries ? undefined : s.power;
    }
    return undefined;
  };

  const gameActions: GameAction[] = [];
  const reminders: string[] = [];
  for (const t of templates) {
    if ('oracle' in t) {
      reminders.push(t.oracle);
      continue;
    }
    if ('playerTask' in t) {
      const who = players(t.who);
      if (who) for (const playerId of who) gameActions.push({ type: 'playerTask', playerId, text: `${card}: ${t.playerTask}` });
      else gameActions.push(ask(`${t.playerTask} Say who.`));
      continue;
    }
    switch (t.gameAction) {
      case 'life': {
        const n = amount(t.amount);
        const who = players(t.who);
        const verb = t.lose ? 'lose' : 'gain';
        if (n === undefined) gameActions.push(ask(`say how much life ${who ? 'is' : 'and who is'} ${t.lose ? 'lost' : 'gained'}.`));
        else if (!who) gameActions.push(ask(`choose a player to ${verb} ${n} life, and say who.`));
        else for (const playerId of who) gameActions.push({ type: 'life', playerId, delta: t.lose ? -n : n });
        break;
      }
      case 'damage': {
        const n = amount(t.amount);
        const sourceId = item.source.permanentId ?? card;
        const isPlayerRef = typeof t.to === 'string' ? t.to !== 'self' && t.to !== 'matched' : false;
        const who = isPlayerRef ? players(t.to as PlayerRef) : undefined;
        const obj = !isPlayerRef && typeof t.to === 'string' ? object(t.to as ObjectRef) : undefined;
        if (n === undefined) gameActions.push(ask('say how much damage is dealt, and to what.'));
        else if (who) for (const playerId of who) gameActions.push({ type: 'damage', sourceId, recipient: { playerId }, amount: n });
        else if (obj) gameActions.push({ type: 'damage', sourceId, recipient: { permanentId: obj }, amount: n });
        else gameActions.push(ask(`choose what is dealt ${n} damage, and say which.`));
        break;
      }
      case 'counters': {
        const n = amount(t.amount);
        const id = object(t.object);
        if (n === undefined) gameActions.push(ask(`say how many ${t.kind} counters, and on what.`));
        else if (id) gameActions.push({ type: 'counters', target: { permanentId: id }, kind: t.kind, delta: n });
        else gameActions.push(ask(`choose what gets ${n} ${t.kind} counter(s), and say which.`));
        break;
      }
      case 'createToken': {
        const n = amount(t.count);
        if (n === undefined) gameActions.push(ask(`say how many ${t.token} tokens are created.`));
        else if (n > 0) gameActions.push({ type: 'createToken', token: t.token, count: n, definition: t.definition });
        break;
      }
      case 'modify': {
        const id = object(t.object);
        if (id) gameActions.push({ type: 'modify', permanentId: id, power: t.power, toughness: t.toughness, ...(t.keywords ? { keywords: t.keywords } : {}), until: 'endOfTurn' });
        else gameActions.push(ask(`choose what gets +${t.power}/+${t.toughness} until end of turn, and say which.`));
        break;
      }
      case 'move': {
        const id = object(t.object);
        if (id) gameActions.push({ type: 'move', objectId: id, to: t.to, ...(t.how ? { how: t.how } : {}) });
        else gameActions.push(ask(`choose what to move to ${t.to}, and say which.`));
        break;
      }
    }
  }
  return { gameActions, reminders };
}

export function toStackItem(state: GameState, trigger: PendingTrigger, id: string): StackItem {
  const ability = findAbility(state, trigger.source.card, trigger.ability);
  const triggeredAbility = ability?.kind === 'triggered' ? ability : undefined;
  const { gameActions, reminders } = fillTemplates(state, trigger, triggeredAbility?.effect ?? []);
  return {
    id,
    kind: 'trigger',
    ability: trigger.ability,
    controllerId: trigger.controllerId,
    source: trigger.source,
    triggeredBy: trigger.triggeredBy,
    matched: trigger.matched,
    targets: [],
    gameActions,
    ...(triggeredAbility?.optional ? { optional: true as const } : {}),
    ...(reminders.length > 0 ? { reminders } : {}),
    status: 'pending',
  };
}

/**
 * The static ability, if any, that makes a permanent enter tapped: its own, unless what it asks for holds, or another
 * permanent's (Authority of the Consuls). `paidLife` says its controller paid what a shock land asks.
 */
export function entersTappedBecause(state: GameState, card: CardName, controllerId: PlayerId, tokenTypes?: string[], paidLife = false): AbilityId | undefined {
  if (tokenTypes && !state.cards[card]) state = { ...state, cards: { ...state.cards, [card]: { name: card, types: tokenTypes, abilities: [] } } };
  for (const a of state.cards[card]?.abilities ?? []) {
    if (a.kind !== 'static' || a.effect.entersTapped !== 'self') continue;
    if (a.effect.unless && entersUntapped(state, a.effect.unless, controllerId, paidLife)) continue;
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

/** The life a land asks to be paid to enter untapped, if it asks for any. */
export function lifeToEnterUntapped(state: GameState, card: CardName): number | undefined {
  for (const a of state.cards[card]?.abilities ?? []) {
    if (a.kind === 'static' && a.effect.entersTapped === 'self' && a.effect.unless?.payLife !== undefined) return a.effect.unless.payLife;
  }
  return undefined;
}

function entersUntapped(state: GameState, unless: EntersUntappedIf, controllerId: PlayerId, paidLife: boolean): boolean {
  if (unless.yourTurnOfGame && !inRange(turnsTaken(state, controllerId), unless.yourTurnOfGame)) return false;
  if (unless.payLife !== undefined && !paidLife) return false;
  return conditionHolds(state, unless, controllerId);
}

/** How many turns this player has started, counting the current one. */
function turnsTaken(state: GameState, playerId: PlayerId): number {
  const seat = state.turnOrder.indexOf(playerId);
  if (seat < 0 || state.turn.number - 1 < seat) return 0;
  return Math.floor((state.turn.number - 1 - seat) / state.turnOrder.length) + 1;
}
