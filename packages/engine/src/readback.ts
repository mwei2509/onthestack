import type { Recipient } from './actions.js';
import type { GameEvent, ZoneMoveReason } from './events.js';
import type { CardName, GameEventId, ObjectId, PlayerId, PlayerStatementId, StackItemId } from './ids.js';
import type { Effect, GameState, StackItem } from './state.js';
import type { Step, Zone } from './steps.js';

/** A player, or an object with the card it was when the event happened. */
export type Named = { playerId: PlayerId } | { objectId: ObjectId; card?: CardName };

export type NoteEffect =
  | { type: 'damage'; source: Named; to: Named; amount: number; deathtouch?: boolean }
  | { type: 'life'; playerId: PlayerId; delta: number; reason: 'damage' | 'gain' | 'loss' | 'payment'; lifelink?: boolean }
  | { type: 'moved'; card: CardName; ownerId: PlayerId; from: Zone | 'nowhere'; to: Zone | 'nowhere'; how?: ZoneMoveReason; isToken?: boolean }
  | { type: 'counters'; target: Named; kind: string; delta: number }
  | { type: 'lost'; playerId: PlayerId; reason: 'life' | 'poison' | 'commanderDamage' | 'conceded' }
  | { type: 'tapped'; target: Named; tapped: boolean }
  | { type: 'control'; target: Named; controllerId: PlayerId }
  | { type: 'modified'; target: Named; effect: Effect };

export type NoteCause =
  | { combatDamage: 'firstStrikeDamage' | 'combatDamage' }
  | { stackItem: StackItemId; kind: StackItem['kind']; card: CardName; controllerId: PlayerId; status: 'resolved' | 'fizzled' | 'conditionNotMet' }
  /** What the engine added on top of a statement's or BoardCorrection's own effects, such as a death or lifelink. */
  | { followsFrom: 'statement' | 'boardCorrection' }
  | { stateBased: true };

/**
 * What the app applied on its own, grouped by cause (ADR 0134): structured, with no text, for devices to word.
 * `entry` is the timeline entry it sits under, named by its first statement, or the Step when no entry led to it.
 */
export interface ReadbackNote {
  cause: NoteCause;
  entry: { playerStatement: PlayerStatementId } | { step: Step };
  effects: NoteEffect[];
}

type Owner = { note: string } | { direct: string } | 'none';

/**
 * Groups a turn's GameEvents into readback notes (ADR 0134, 0135): one per combat damage step and one per resolved
 * Stack item, each with everything that follows from it; one for what the engine added after a statement or
 * BoardCorrection; nothing for turn structure or for what a statement or correction did directly. `turnStart` only
 * supplies the names of permanents that were already on the battlefield.
 */
export function readbackNotes(turnStart: GameState, events: GameEvent[]): ReadbackNote[] {
  const byId = new Map<GameEventId, GameEvent>(events.map((e) => [e.id, e]));
  const names = new Map<ObjectId, CardName>(Object.values(turnStart.permanents).map((p) => [p.id, p.card]));
  const stackItems = new Map<StackItemId, { created: GameEvent; kind: StackItem['kind']; card: CardName; controllerId: PlayerId }>();
  const owners = new Map<GameEventId, Owner>();
  const notes = new Map<string, ReadbackNote>();
  let step: Step = turnStart.turn.step;
  let lastAttack: GameEvent | undefined;
  let previous: Owner = 'none';

  const entryOf = (id: GameEventId | undefined, seen = new Set<GameEventId>()): PlayerStatementId | undefined => {
    const e = id ? byId.get(id) : undefined;
    if (!e || seen.has(e.id)) return undefined;
    seen.add(e.id);
    const c = e.causedBy;
    if ('playerStatement' in c) return c.playerStatement;
    if ('gameEvent' in c) return entryOf(c.gameEvent, seen);
    if ('stackItem' in c) return entryOf(stackItems.get(c.stackItem)?.created.id, seen);
    if (c.rule === 'stateBasedAction') return entryOf(c.after ?? (e.type === 'ZoneChanged' ? e.moves.find((m) => m.after)?.after : undefined), seen);
    return undefined;
  };
  const entry = (statement: PlayerStatementId | undefined): ReadbackNote['entry'] => (statement ? { playerStatement: statement } : { step });
  const open = (key: string, make: () => Omit<ReadbackNote, 'effects'>): Owner => {
    if (!notes.has(key)) notes.set(key, { ...make(), effects: [] });
    return { note: key };
  };
  /** An event the engine added: in the parent's note, or a note of its own when the parent was a statement's direct effect. */
  const following = (parent: Owner, at: GameEvent): Owner => {
    if (parent === 'none') return open(`rule:${at.id}`, () => ({ cause: { stateBased: true }, entry: { step } }));
    if ('note' in parent) return parent;
    return open(`follow:${parent.direct}`, () => ({
      cause: { followsFrom: parent.direct.startsWith('statement:') ? 'statement' : 'boardCorrection' },
      entry: entry(parent.direct.startsWith('statement:') ? parent.direct.slice('statement:'.length) : undefined),
    }));
  };
  const ownerOf = (id: GameEventId | undefined): Owner | undefined => (id ? owners.get(id) : undefined);
  const name = (id: ObjectId): Named => ({ objectId: id, ...(names.has(id) ? { card: names.get(id) } : {}) });
  const named = (r: Recipient): Named => ('playerId' in r ? { playerId: r.playerId } : name(r.permanentId));
  const add = (owner: Owner, effect: NoteEffect) => {
    if (owner !== 'none' && 'note' in owner) notes.get(owner.note)!.effects.push(effect);
  };

  for (const e of events) {
    const c = e.causedBy;
    let owner: Owner;
    if ('playerStatement' in c) owner = { direct: `statement:${c.playerStatement}` };
    else if ('stackItem' in c) {
      const item = stackItems.get(c.stackItem);
      owner = open(`stack:${c.stackItem}`, () => ({
        cause: { stackItem: c.stackItem, kind: item?.kind ?? 'spell', card: item?.card ?? c.stackItem, controllerId: item?.controllerId ?? '', status: 'resolved' },
        entry: entry(entryOf(item?.created.id)),
      }));
    } else if ('gameEvent' in c) {
      const parent = ownerOf(c.gameEvent) ?? 'none';
      const lifelink = e.type === 'LifeChanged' && e.reason === 'gain' && byId.get(c.gameEvent)?.type === 'DamageDealt';
      owner = lifelink && parent !== 'none' && 'direct' in parent ? following(parent, e) : parent;
    } else if (c.rule === 'combatDamage') {
      owner = open(`combat:${e.id}`, () => ({
        cause: { combatDamage: step === 'firstStrikeDamage' ? 'firstStrikeDamage' : 'combatDamage' },
        entry: entry(lastAttack ? entryOf(lastAttack.id) : undefined),
      }));
    } else if (c.rule === 'boardCorrection') owner = { direct: `boardCorrection:${e.id}` };
    else if (c.rule === 'turnStructure') owner = 'none';
    else owner = stateBased(e, c.after);

    owners.set(e.id, owner);
    previous = owner;
    record(e, owner);
  }

  /** A death carries what brought it about on each move; without one, the pass belongs with what was just applied. */
  function stateBased(e: GameEvent, after: GameEventId | undefined): Owner {
    const moveAfter = e.type === 'ZoneChanged' ? e.moves.find((m) => m.after)?.after : undefined;
    const parent = ownerOf(after ?? moveAfter) ?? (after ?? moveAfter ? 'none' : previous);
    return following(parent, e);
  }

  function record(e: GameEvent, owner: Owner) {
    switch (e.type) {
      case 'PhaseStarted':
        step = e.step;
        return;
      case 'AttackersDeclared':
        lastAttack = e;
        return;
      case 'SpellCast':
        stackItems.set(e.stackItemId, { created: e, kind: 'spell', card: e.card, controllerId: e.casterId });
        names.set(e.stackItemId, e.card);
        return;
      case 'AbilityTriggered':
        stackItems.set(e.stackItem.id, { created: e, kind: e.stackItem.kind, card: e.stackItem.source.card, controllerId: e.stackItem.controllerId });
        names.set(e.stackItem.id, e.stackItem.source.card);
        return;
      case 'StackItemResolved': {
        const note = owner !== 'none' && 'note' in owner ? notes.get(owner.note) : undefined;
        if (note && 'stackItem' in note.cause && e.status !== 'countered') note.cause.status = e.status;
        return;
      }
      case 'DamageDealt':
        for (const d of e.damage) add(owner, { type: 'damage', source: name(d.sourceId), to: named(d.recipient), amount: d.amount, ...(d.deathtouch ? { deathtouch: true } : {}) });
        return;
      case 'LifeChanged': {
        const parent = 'gameEvent' in e.causedBy ? byId.get(e.causedBy.gameEvent) : undefined;
        add(owner, { type: 'life', playerId: e.playerId, delta: e.delta, reason: e.reason, ...(e.reason === 'gain' && parent?.type === 'DamageDealt' ? { lifelink: true } : {}) });
        return;
      }
      case 'ZoneChanged':
        for (const m of e.moves) {
          if (m.objectId && e.to === 'battlefield') names.set(m.objectId, m.card);
          if (e.from === 'stack') continue;
          const moveOwner = e.causedBy && 'rule' in e.causedBy && e.causedBy.rule === 'stateBasedAction' && m.after ? following(ownerOf(m.after) ?? 'none', e) : owner;
          add(moveOwner, { type: 'moved', card: m.card, ownerId: m.ownerId, from: e.from, to: e.to, ...(e.how ? { how: e.how } : {}), ...(m.isToken ? { isToken: true } : {}) });
        }
        return;
      case 'CountersChanged':
        add(owner, { type: 'counters', target: named(e.target), kind: e.kind, delta: e.delta });
        return;
      case 'PlayerLost':
        add(owner, { type: 'lost', playerId: e.playerId, reason: e.reason });
        return;
      case 'TapChanged':
        add(owner, { type: 'tapped', target: name(e.permanentId), tapped: e.tapped });
        return;
      case 'ControlChanged':
        add(owner, { type: 'control', target: name(e.permanentId), controllerId: e.controllerId });
        return;
      case 'EffectAdded':
        add(owner, { type: 'modified', target: name(e.permanentId), effect: e.effect });
        return;
      default:
        return;
    }
  }

  return [...notes.values()].filter((n) => n.effects.length > 0 || ('stackItem' in n.cause && n.cause.status !== 'resolved'));
}
