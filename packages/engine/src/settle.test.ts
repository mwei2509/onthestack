import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import type { GameAction } from './actions.js';
import { applyAction } from './apply.js';
import type { CardDefinition } from './cards.js';
import type { GameEvent } from './events.js';
import { createGame } from './game.js';
import { settle } from './settle.js';
import { resolveTop } from './stack.js';
import type { GameState } from './state.js';
import { stats } from './stats.js';

const cards: Record<string, CardDefinition> = {
  'Savannah Lions': { name: 'Savannah Lions', types: ['Creature'], power: 2, toughness: 1, abilities: [] },
  'Grizzly Bears': { name: 'Grizzly Bears', types: ['Creature'], power: 2, toughness: 2, abilities: [] },
  'Typhoid Rats': { name: 'Typhoid Rats', types: ['Creature'], power: 1, toughness: 1, keywords: ['Deathtouch'], abilities: [] },
  'Darksteel Myr': { name: 'Darksteel Myr', types: ['Artifact', 'Creature'], power: 0, toughness: 1, keywords: ['Indestructible'], abilities: [] },
  'Vampire Nighthawk': { name: 'Vampire Nighthawk', types: ['Creature'], power: 2, toughness: 3, keywords: ['Deathtouch', 'Flying', 'Lifelink'], abilities: [] },
  'Teysa Karlov': { name: 'Teysa Karlov', types: ['Creature'], legendary: true, power: 2, toughness: 4, abilities: [] },
  Plains: { name: 'Plains', types: ['Land'], abilities: [] },
};

const newGame = () =>
  createGame(
    [
      { id: 'theo', name: 'Theo', commander: 'Teysa Karlov' },
      { id: 'melissa', name: 'Melissa' },
      { id: 'elena', name: 'Elena' },
    ],
    cards,
  );

function play(state: GameState, steps: [GameAction, string][]) {
  const events: GameEvent[] = [];
  steps.forEach(([action, playerId], i) => {
    const r = applyAction(state, action, { playerId, cause: { playerStatement: `s${i + 1}` } });
    state = r.state;
    events.push(...r.events);
    while (state.stack.length > 0) {
      const x = resolveTop(state);
      state = x.state;
      events.push(...x.events);
    }
  });
  return { state, events };
}

describe('stats', () => {
  it('reads printed power and toughness, then adds modifiers and counters', () => {
    const { state } = play(newGame(), [
      [{ type: 'cast', card: 'Grizzly Bears' }, 'theo'],
      [{ type: 'modify', permanentId: 'p1', power: 3, toughness: 3, keywords: ['Trample'], until: 'endOfTurn' }, 'theo'],
      [{ type: 'counters', target: { permanentId: 'p1' }, kind: '+1/+1', delta: 2 }, 'theo'],
    ]);
    expect(stats(state.permanents.p1!, state)).toEqual({ isCreature: true, power: 7, toughness: 7, keywords: ['Trample'] });
  });

  it('applies "becomes X/Y" before modifiers, latest timestamp winning, and switches last', () => {
    const { state } = play(newGame(), [[{ type: 'cast', card: 'Grizzly Bears' }, 'theo']]);
    const p = state.permanents.p1!;
    p.effects = [
      { kind: 'add', power: 1, toughness: 0, until: 'endOfTurn', timestamp: 1 },
      { kind: 'set', power: 0, toughness: 1, until: 'endOfTurn', timestamp: 2 },
      { kind: 'set', power: 4, toughness: 4, until: 'endOfTurn', timestamp: 3 },
      { kind: 'switch', until: 'endOfTurn', timestamp: 4 },
    ];
    p.counters = { '-1/-1': 1 };
    expect(stats(p, state)).toMatchObject({ power: 3, toughness: 4 });
  });

  it('treats an unknown card as a non-creature, so nothing is killed by a guess', () => {
    const { state } = play(newGame(), [[{ type: 'playLand', card: 'Wastes' }, 'theo']]);
    expect(stats(state.permanents.p1!, state)).toMatchObject({ isCreature: false, power: 0, toughness: 0 });
  });

  test.prop([fc.array(fc.record({ p: fc.integer({ min: -5, max: 5 }), t: fc.integer({ min: -5, max: 5 }) }), { maxLength: 8 })])(
    'the order of modifiers doesn’t change the result',
    (mods) => {
      const { state } = play(newGame(), [[{ type: 'cast', card: 'Grizzly Bears' }, 'theo']]);
      const p = state.permanents.p1!;
      const withOrder = (list: typeof mods) => {
        p.effects = list.map((m, i) => ({ kind: 'add' as const, power: m.p, toughness: m.t, until: 'endOfTurn' as const, timestamp: i }));
        return stats(p, state);
      };
      expect(withOrder(mods)).toEqual(withOrder([...mods].reverse()));
    },
  );
});

describe('settle', () => {
  it('a creature with lethal damage dies, and its cause points at the damage', () => {
    const { state, events } = play(newGame(), [
      [{ type: 'cast', card: 'Grizzly Bears' }, 'theo'],
      [{ type: 'damage', sourceId: 'k9', recipient: { permanentId: 'p1' }, amount: 2 }, 'melissa'],
    ]);
    const damage = events.find((e) => e.type === 'DamageDealt')!;
    const r = settle(state);
    expect(r.events).toMatchObject([{ type: 'ZoneChanged', to: 'graveyard', how: 'stateBased', moves: [{ objectId: 'p1', after: damage.id }], causedBy: { rule: 'stateBasedAction' } }]);
    expect(r.state.graveyards.theo).toEqual(['Grizzly Bears']);
  });

  it('a creature shrunk to 0 toughness dies, caused by the effect that shrank it (Disfigure on Grizzly Bears)', () => {
    const { state, events } = play(newGame(), [
      [{ type: 'cast', card: 'Grizzly Bears' }, 'theo'],
      [{ type: 'modify', permanentId: 'p1', power: -2, toughness: -2, until: 'endOfTurn' }, 'melissa'],
    ]);
    const shrink = events.find((e) => e.type === 'EffectAdded')!;
    expect(settle(state).events[0]).toMatchObject({ moves: [{ objectId: 'p1', after: shrink.id }] });
  });

  it('indestructible survives lethal damage but not 0 toughness', () => {
    const damaged = play(newGame(), [
      [{ type: 'cast', card: 'Darksteel Myr' }, 'theo'],
      [{ type: 'damage', sourceId: 'k9', recipient: { permanentId: 'p1' }, amount: 5 }, 'melissa'],
    ]);
    expect(settle(damaged.state).events).toEqual([]);
    const shrunk = play(damaged.state, [[{ type: 'modify', permanentId: 'p1', power: 0, toughness: -1, until: 'endOfTurn' }, 'melissa']]);
    expect(settle(shrunk.state).events).toMatchObject([{ type: 'ZoneChanged', to: 'graveyard', moves: [{ objectId: 'p1' }] }]);
  });

  it('one damage from a deathtouch source is lethal; lifelink gains its controller that much', () => {
    const { state } = play(newGame(), [
      [{ type: 'cast', card: 'Vampire Nighthawk' }, 'melissa'],
      [{ type: 'cast', card: 'Teysa Karlov' }, 'theo'],
      [{ type: 'damage', sourceId: 'p1', recipient: { permanentId: 'p2' }, amount: 1 }, 'melissa'],
    ]);
    expect(state.players.melissa!.life).toBe(41);
    expect(settle(state).state.permanents.p2).toBeUndefined();
  });

  it('creatures that are lethal at the same time die in one GameEvent (ADR 0026)', () => {
    const { state } = play(newGame(), [
      [{ type: 'cast', card: 'Savannah Lions' }, 'theo'],
      [{ type: 'cast', card: 'Typhoid Rats' }, 'melissa'],
      [{ type: 'damage', sourceId: 'p2', recipient: { permanentId: 'p1' }, amount: 1 }, 'melissa'],
      [{ type: 'damage', sourceId: 'p1', recipient: { permanentId: 'p2' }, amount: 2 }, 'theo'],
    ]);
    const r = settle(state);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]!.type === 'ZoneChanged' && r.events[0]!.moves.map((m) => m.objectId)).toEqual(['p1', 'p2']);
  });

  it('a player at 0 life, with 10 poison, or with 21 commander damage from one commander loses', () => {
    const s = newGame();
    s.players.theo!.life = 0;
    s.players.melissa!.poison = 10;
    s.players.elena!.commanderDamage['Teysa Karlov'] = 21;
    expect(settle(s).events.map((e) => e.type === 'PlayerLost' && [e.playerId, e.reason])).toEqual([
      ['theo', 'life'],
      ['melissa', 'poison'],
      ['elena', 'commanderDamage'],
    ]);
  });

  it('when a player leaves, what they own leaves the game and what they’d taken goes back (CR 800.4a, ADR 0029)', () => {
    const { state } = play(newGame(), [
      [{ type: 'cast', card: 'Grizzly Bears' }, 'theo'],
      [{ type: 'cast', card: 'Savannah Lions' }, 'melissa'],
      [{ type: 'gainControl', permanentId: 'p2' }, 'theo'],
      [{ type: 'life', playerId: 'theo', delta: -40 }, 'melissa'],
    ]);
    const r = settle(state);
    expect(r.state.players.theo!.out).toBe(true);
    expect(Object.values(r.state.permanents).map((p) => [p.card, p.controllerId])).toEqual([['Savannah Lions', 'melissa']]);
    expect(r.state.permanents.p2!.controlChange).toBeUndefined();
    expect(r.state.exile).toEqual([]);
    expect(r.state.graveyards.theo).toEqual([]);
  });

  it('an indefinite steal remembers who it was taken from', () => {
    const { state } = play(newGame(), [
      [{ type: 'cast', card: 'Savannah Lions' }, 'melissa'],
      [{ type: 'gainControl', permanentId: 'p1' }, 'theo'],
    ]);
    expect(state.permanents.p1!.controlChange).toEqual({ revertTo: 'melissa' });
  });

  it('+1/+1 and -1/-1 counters cancel out', () => {
    const { state } = play(newGame(), [
      [{ type: 'cast', card: 'Grizzly Bears' }, 'theo'],
      [{ type: 'counters', target: { permanentId: 'p1' }, kind: '+1/+1', delta: 3 }, 'theo'],
      [{ type: 'counters', target: { permanentId: 'p1' }, kind: '-1/-1', delta: 1 }, 'melissa'],
    ]);
    expect(settle(state).state.permanents.p1!.counters).toEqual({ '+1/+1': 2 });
  });

  it('a commander that dies goes back to the command zone by default', () => {
    const { state } = play(newGame(), [
      [{ type: 'cast', card: 'Teysa Karlov' }, 'theo'],
      [{ type: 'move', objectId: 'p1', to: 'graveyard', how: 'destroy' }, 'melissa'],
    ]);
    const r = settle(state);
    expect(r.state.graveyards.theo).toEqual([]);
    expect(r.state.commandZone.theo).toEqual({ card: 'Teysa Karlov', casts: 1, inZone: true });
  });

  it('a token gets its characteristics from its definition and vanishes when it dies', () => {
    const { state } = play(newGame(), [
      [{ type: 'createToken', token: 'Soldier', count: 1, definition: { types: ['Creature'], power: 1, toughness: 1 } }, 'melissa'],
      [{ type: 'damage', sourceId: 'k9', recipient: { permanentId: 'p1' }, amount: 1 }, 'theo'],
    ]);
    const r = settle(state);
    expect(r.state.permanents).toEqual({});
    expect(r.state.graveyards.melissa).toEqual([]);
  });
});

const op = fc.record({
  kind: fc.constantFrom('cast', 'damage', 'shrink', 'grow', 'minusCounter', 'life', 'poison', 'token', 'steal'),
  player: fc.constantFrom('theo', 'melissa', 'elena'),
  card: fc.constantFrom('Savannah Lions', 'Grizzly Bears', 'Typhoid Rats', 'Darksteel Myr', 'Vampire Nighthawk', 'Teysa Karlov'),
  pick: fc.nat(),
  n: fc.integer({ min: 1, max: 12 }),
});
type Op = typeof op extends fc.Arbitrary<infer T> ? T : never;

function randomBoard(ops: Op[]): GameState {
  let state = newGame();
  ops.forEach((o, i) => {
    const ids = Object.keys(state.permanents);
    const target = ids[o.pick % Math.max(ids.length, 1)] ?? 'p999';
    const action: GameAction = {
      cast: { type: 'cast', card: o.card } as GameAction,
      damage: { type: 'damage', sourceId: ids[(o.pick + 1) % Math.max(ids.length, 1)] ?? 'k1', recipient: { permanentId: target }, amount: o.n } as GameAction,
      shrink: { type: 'modify', permanentId: target, power: -o.n, toughness: -o.n, until: 'endOfTurn' } as GameAction,
      grow: { type: 'modify', permanentId: target, power: o.n, toughness: o.n, until: 'endOfTurn' } as GameAction,
      minusCounter: { type: 'counters', target: { permanentId: target }, kind: '-1/-1', delta: o.n } as GameAction,
      life: { type: 'life', playerId: o.player, delta: -o.n * 4 } as GameAction,
      poison: { type: 'counters', target: { playerId: o.player }, kind: 'poison', delta: o.n } as GameAction,
      token: { type: 'createToken', token: 'Soldier', count: 1, definition: { types: ['Creature'], power: 1, toughness: 1 } } as GameAction,
      steal: { type: 'gainControl', permanentId: target } as GameAction,
    }[o.kind];
    state = applyAction(state, action, { playerId: o.player, cause: { playerStatement: `s${i + 1}` } }).state;
    while (state.stack.length > 0) state = resolveTop(state).state;
  });
  return state;
}

describe('settle properties', () => {
  test.prop([fc.array(op, { maxLength: 30 })])('after settling, nothing that should be dead or out is left', (ops) => {
    const { state } = settle(randomBoard(ops));
    for (const p of Object.values(state.permanents)) {
      const s = stats(p, state);
      if (!s.isCreature) continue;
      expect(s.toughness).toBeGreaterThan(0);
      if (!s.keywords.includes('Indestructible')) {
        expect(p.damage).toBeLessThan(s.toughness);
        expect(p.deathtouchDamage && p.damage > 0).toBe(false);
      }
    }
    for (const player of Object.values(state.players)) {
      if (!player.out) expect(player.life > 0 && player.poison < 10).toBe(true);
    }
  });

  test.prop([fc.array(op, { maxLength: 30 })])('settling a settled board changes nothing', (ops) => {
    const once = settle(randomBoard(ops));
    const twice = settle(once.state);
    expect(twice.events).toEqual([]);
    expect(twice.state).toEqual(once.state);
  });

  test.prop([fc.array(op, { maxLength: 30 })])('is deterministic', (ops) => {
    expect(settle(randomBoard(ops))).toEqual(settle(randomBoard(ops)));
  });
});
