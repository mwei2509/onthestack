import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import type { GameAction } from './actions.js';
import { applyAction, type ApplyContext } from './apply.js';
import type { CardDefinition } from './cards.js';
import type { GameEvent } from './events.js';
import { createGame } from './game.js';
import { reduce } from './reduce.js';
import { resolveTop } from './stack.js';
import type { GameState } from './state.js';

const cards: Record<string, CardDefinition> = {
  Plains: { name: 'Plains', types: ['Land'], abilities: [] },
  'Savannah Lions': { name: 'Savannah Lions', cost: '{W}', types: ['Creature'], power: 2, toughness: 1, abilities: [] },
  'Fatal Push': { name: 'Fatal Push', cost: '{B}', types: ['Instant'], abilities: [] },
  'Teysa Karlov': { name: 'Teysa Karlov', cost: '{2}{W}{B}', types: ['Creature'], legendary: true, power: 2, toughness: 4, abilities: [] },
};

const newGame = () =>
  createGame(
    [
      { id: 'theo', name: 'Theo', commander: 'Teysa Karlov' },
      { id: 'melissa', name: 'Melissa' },
    ],
    cards,
  );

const said = (playerId: string, n = 1): ApplyContext => ({ playerId, cause: { playerStatement: `s${n}` } });

function run(state: GameState, steps: [GameAction, ApplyContext][]) {
  const events: GameEvent[] = [];
  const warnings = [];
  for (const [action, ctx] of steps) {
    const r = applyAction(state, action, ctx);
    state = r.state;
    events.push(...r.events);
    warnings.push(...r.warnings);
    while (state.stack.length > 0) {
      const x = resolveTop(state);
      state = x.state;
      events.push(...x.events);
      warnings.push(...x.warnings);
    }
  }
  return { state, events, warnings };
}

describe('applyAction', () => {
  it('plays a land onto the battlefield, untapped, controlled by the player', () => {
    const { state, events } = run(newGame(), [[{ type: 'playLand', card: 'Plains' }, said('theo')]]);
    expect(events).toMatchObject([{ id: 'e1', type: 'ZoneChanged', from: 'hand', to: 'battlefield', moves: [{ objectId: 'p1', card: 'Plains', ownerId: 'theo' }], causedBy: { playerStatement: 's1' } }]);
    expect(state.permanents.p1).toMatchObject({ card: 'Plains', ownerId: 'theo', controllerId: 'theo', tapped: false, controlledSince: 1 });
  });

  it('casting puts a Stack item on the stack; nothing enters until it resolves', () => {
    const r = applyAction(newGame(), { type: 'cast', card: 'Savannah Lions' }, said('theo'));
    expect(r.events).toMatchObject([{ type: 'SpellCast', casterId: 'theo', card: 'Savannah Lions', stackItemId: 'k1', from: 'hand' }]);
    expect(r.state.stack).toMatchObject([{ id: 'k1', kind: 'spell', controllerId: 'theo', source: { card: 'Savannah Lions' }, status: 'pending' }]);
    expect(r.state.permanents).toEqual({});
  });

  it('a creature spell resolves onto the battlefield, caused by its Stack item', () => {
    const { state, events } = run(newGame(), [[{ type: 'cast', card: 'Savannah Lions' }, said('theo')]]);
    expect(events).toMatchObject([
      { type: 'SpellCast', stackItemId: 'k1' },
      { type: 'StackItemResolved', stackItemId: 'k1', status: 'resolved' },
      { type: 'ZoneChanged', from: 'stack', to: 'battlefield', how: 'resolve', moves: [{ objectId: 'p1' }], causedBy: { stackItem: 'k1' } },
    ]);
    expect(state.stack).toEqual([]);
    expect(state.permanents.p1?.card).toBe('Savannah Lions');
  });

  it('casts an instant: it goes to its owner’s graveyard when it resolves', () => {
    const { state, events } = run(newGame(), [[{ type: 'cast', card: 'Fatal Push' }, said('theo')]]);
    expect(events.map((e) => e.type)).toEqual(['SpellCast', 'StackItemResolved', 'ZoneChanged']);
    expect(state.graveyards.theo).toEqual(['Fatal Push']);
  });

  it('casts a commander from the command zone and counts the cast', () => {
    const { state, events } = run(newGame(), [[{ type: 'cast', card: 'Teysa Karlov' }, said('theo')]]);
    expect(events[0]).toMatchObject({ type: 'SpellCast', from: 'command' });
    expect(state.commandZone.theo).toEqual({ card: 'Teysa Karlov', casts: 1, inZone: false });
  });

  it('damage to a player is a DamageDealt followed by a LifeChanged that it caused', () => {
    const { state, events } = run(newGame(), [
      [{ type: 'playLand', card: 'Plains' }, said('theo')],
      [{ type: 'damage', sourceId: 'p1', recipient: { playerId: 'theo' }, amount: 1 }, said('theo', 2)],
    ]);
    const [dealt, life] = events.slice(1);
    expect(dealt).toMatchObject({ type: 'DamageDealt', damage: [{ sourceId: 'p1', recipient: { playerId: 'theo' }, amount: 1, combat: false }] });
    expect(life).toMatchObject({ type: 'LifeChanged', playerId: 'theo', delta: -1, lifeAfter: 39, reason: 'damage', causedBy: { gameEvent: dealt!.id } });
    expect(state.players.theo?.life).toBe(39);
  });

  it('marks damage on a permanent without changing anyone’s life', () => {
    const { state } = run(newGame(), [
      [{ type: 'cast', card: 'Savannah Lions' }, said('melissa')],
      [{ type: 'damage', sourceId: 'k9', recipient: { permanentId: 'p1' }, amount: 1 }, said('theo', 2)],
    ]);
    expect(state.permanents.p1?.damage).toBe(1);
    expect(state.players.melissa?.life).toBe(40);
  });

  it('tokens are created together and vanish instead of going to the graveyard', () => {
    const { state, events } = run(newGame(), [
      [{ type: 'createToken', token: 'Soldier', count: 3 }, said('melissa')],
      [{ type: 'move', objectId: 'p2', to: 'graveyard', how: 'destroy' }, said('theo', 2)],
    ]);
    expect(events[0]).toMatchObject({ type: 'ZoneChanged', from: 'nowhere', moves: [{ objectId: 'p1', isToken: true }, { objectId: 'p2' }, { objectId: 'p3' }] });
    expect(Object.keys(state.permanents)).toEqual(['p1', 'p3']);
    expect(state.graveyards.melissa).toEqual([]);
  });

  it('a temporary control change records who gets it back and resets summoning sickness', () => {
    const { state } = run(newGame(), [
      [{ type: 'cast', card: 'Savannah Lions' }, said('melissa')],
      [{ type: 'gainControl', permanentId: 'p1', until: 'endOfTurn' }, said('theo', 2)],
    ]);
    expect(state.permanents.p1).toMatchObject({ controllerId: 'theo', controlChange: { revertTo: 'melissa', until: 'endOfTurn' }, controlledSince: 1 });
  });

  it('poison counters on a player add to their poison', () => {
    const { state } = run(newGame(), [[{ type: 'counters', target: { playerId: 'melissa' }, kind: 'poison', delta: 3 }, said('theo')]]);
    expect(state.players.melissa?.poison).toBe(3);
  });

  it('a PlayerTask is a TableEvent: no GameEvent, and the board is unchanged (ADR 0020)', () => {
    const before = newGame();
    const r = applyAction(before, { type: 'playerTask', playerId: 'theo', text: 'Reveal the top card of your library' }, said('michael'));
    expect(r.events).toEqual([]);
    expect(r.tableEvents).toEqual([{ type: 'PlayerTaskCreated', playerId: 'theo', text: 'Reveal the top card of your library', causedBy: { playerStatement: 's1' } }]);
    expect(r.state).toEqual(before);
  });

  it('flags an unknown card instead of guessing what it is', () => {
    const { state, events, warnings } = run(newGame(), [[{ type: 'cast', card: 'Ulamog, the Ceaseless Hunger' }, said('theo')]]);
    expect(events.map((e) => e.type)).toEqual(['SpellCast', 'StackItemResolved']);
    expect(warnings).toMatchObject([{ code: 'unknownCard' }, { code: 'unknownCard' }]);
    expect(state.permanents).toEqual({});
  });

  it('flags a GameAction on something that isn’t there, and changes nothing', () => {
    const before = newGame();
    const { state, events, warnings } = run(before, [[{ type: 'tap', permanentId: 'p7' }, said('theo')]]);
    expect(events).toEqual([]);
    expect(warnings).toMatchObject([{ code: 'notOnBattlefield', objectIds: ['p7'] }]);
    expect(state).toEqual(before);
  });
});

// Random sequences of GameActions, built against whatever is on the battlefield at that point.
const op = fc.record({
  kind: fc.constantFrom('playLand', 'castCreature', 'castInstant', 'castUnknown', 'life', 'damagePlayer', 'damagePermanent', 'tap', 'untap', 'move', 'counters', 'poison', 'token', 'gainControl', 'modify', 'missing'),
  player: fc.constantFrom('theo', 'melissa'),
  pick: fc.nat(),
  amount: fc.integer({ min: -5, max: 7 }),
});

type Op = typeof op extends fc.Arbitrary<infer T> ? T : never;

function toAction(state: GameState, o: Op): GameAction {
  const ids = Object.keys(state.permanents);
  const target = ids.length ? ids[o.pick % ids.length]! : 'p999';
  const n = Math.abs(o.amount) + 1;
  switch (o.kind) {
    case 'playLand': return { type: 'playLand', card: 'Plains' };
    case 'castCreature': return { type: 'cast', card: 'Savannah Lions' };
    case 'castInstant': return { type: 'cast', card: 'Fatal Push', targets: ids.length ? [target] : [] };
    case 'castUnknown': return { type: 'cast', card: 'Some Card' };
    case 'life': return { type: 'life', playerId: o.player, delta: o.amount };
    case 'damagePlayer': return { type: 'damage', sourceId: target, recipient: { playerId: o.player }, amount: n };
    case 'damagePermanent': return { type: 'damage', sourceId: 'k1', recipient: { permanentId: target }, amount: n };
    case 'tap': return { type: 'tap', permanentId: target };
    case 'untap': return { type: 'untap', permanentId: target };
    case 'move': return { type: 'move', objectId: target, to: o.pick % 2 ? 'graveyard' : 'exile', how: 'destroy' };
    case 'counters': return { type: 'counters', target: { permanentId: target }, kind: '+1/+1', delta: o.amount };
    case 'poison': return { type: 'counters', target: { playerId: o.player }, kind: 'poison', delta: n };
    case 'token': return { type: 'createToken', token: 'Soldier', count: n };
    case 'gainControl': return { type: 'gainControl', permanentId: target, until: 'endOfTurn' };
    case 'modify': return { type: 'modify', permanentId: target, power: o.amount, toughness: o.amount, until: 'endOfTurn' };
    default: return { type: 'tap', permanentId: 'p999' };
  }
}

function runOps(ops: Op[]) {
  let state = newGame();
  const events: GameEvent[] = [];
  ops.forEach((o, i) => {
    const r = applyAction(state, toAction(state, o), { playerId: o.player, cause: { playerStatement: `s${i + 1}` } });
    state = r.state;
    events.push(...r.events);
    if (o.pick % 3 !== 0) {
      while (state.stack.length > 0) {
        const x = resolveTop(state);
        state = x.state;
        events.push(...x.events);
      }
    }
  });
  return { state, events };
}

describe('applyAction properties', () => {
  test.prop([fc.array(op, { maxLength: 40 })])('is deterministic: the same GameActions give an identical result, IDs included', (ops) => {
    expect(runOps(ops)).toEqual(runOps(ops));
  });

  test.prop([fc.array(op, { maxLength: 40 })])('folding the emitted GameEvents from the start rebuilds the same state', (ops) => {
    const { state, events } = runOps(ops);
    expect(events.reduce(reduce, newGame())).toEqual(state);
  });

  test.prop([fc.array(op, { maxLength: 40 })])('every cause points at something real', (ops) => {
    const { events } = runOps(ops);
    const seen = new Set<string>();
    const stackItems = new Set<string>();
    for (const e of events) {
      const c = e.causedBy;
      if ('gameEvent' in c) expect(seen.has(c.gameEvent)).toBe(true);
      if ('stackItem' in c) expect(stackItems.has(c.stackItem)).toBe(true);
      if ('playerStatement' in c) expect(c.playerStatement).toMatch(/^s\d+$/);
      seen.add(e.id);
      if (e.type === 'SpellCast') stackItems.add(e.stackItemId);
    }
  });

  test.prop([fc.array(op, { maxLength: 40 })])('life totals change only through LifeChanged, by exactly its deltas', (ops) => {
    const { state, events } = runOps(ops);
    for (const id of ['theo', 'melissa']) {
      const sum = events.filter((e) => e.type === 'LifeChanged' && e.playerId === id).reduce((n, e) => n + (e as { delta: number }).delta, 0);
      expect(state.players[id]!.life).toBe(40 + sum);
    }
  });

  test.prop([fc.array(op, { maxLength: 40 })])('GameEvent IDs are unique and in order', (ops) => {
    const ids = runOps(ops).events.map((e) => Number(e.id.slice(1)));
    expect(ids).toEqual(ids.map((_, i) => i + 1));
  });
});
