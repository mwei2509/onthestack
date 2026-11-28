import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import type { GameAction } from './actions.js';
import { applyAction } from './apply.js';
import { clone } from './clone.js';
import type { CardDefinition } from './cards.js';
import { emit } from './emit.js';
import type { GameEvent, GameEventBody } from './events.js';
import { createGame } from './game.js';
import { reduce } from './reduce.js';
import { settle } from './settle.js';
import type { GameState } from './state.js';

// Translations as drafted in docs/engine-model.md section 7. Real cards from the example game.
const cards: Record<string, CardDefinition> = {
  'Hinterland Sanctifier': {
    name: 'Hinterland Sanctifier', types: ['Creature'], power: 1, toughness: 2,
    abilities: [{ id: 'hinterland-sanctifier#1', kind: 'triggered',
      when: { event: 'ZoneChanged', to: 'battlefield', object: { types: ['Creature'], controller: 'you', other: true } },
      effect: [{ gameAction: 'life', who: 'you', delta: 1 }] }],
  },
  'Haliya, Guided by Light': {
    name: 'Haliya, Guided by Light', types: ['Creature'], legendary: true, power: 3, toughness: 3,
    abilities: [
      { id: 'haliya-guided-by-light#1', kind: 'triggered',
        when: { event: 'ZoneChanged', to: 'battlefield', object: { selfOr: { types: ['Creature', 'Artifact'], controller: 'you' } } },
        effect: [{ gameAction: 'life', who: 'you', delta: 1 }] },
      { id: 'haliya-guided-by-light#2', kind: 'triggered',
        when: { event: 'PhaseStarted', step: 'end', whose: 'you' },
        if: { lifeGainedThisTurn: { who: 'you', atLeast: 3 } },
        effect: [{ playerTask: 'Draw a card', who: 'you' }] },
    ],
  },
  'Authority of the Consuls': {
    name: 'Authority of the Consuls', types: ['Enchantment'],
    abilities: [
      { id: 'authority-of-the-consuls#1', kind: 'static', effect: { entersTapped: { types: ['Creature'], controller: 'opponent' } } },
      { id: 'authority-of-the-consuls#2', kind: 'triggered',
        when: { event: 'ZoneChanged', to: 'battlefield', object: { types: ['Creature'], controller: 'opponent' } },
        effect: [{ gameAction: 'life', who: 'you', delta: 1 }] },
    ],
  },
  'Case of the Uneaten Feast': {
    name: 'Case of the Uneaten Feast', types: ['Enchantment'],
    abilities: [{ id: 'case-of-the-uneaten-feast#1', kind: 'triggered',
      when: { event: 'ZoneChanged', to: 'battlefield', object: { types: ['Creature'], controller: 'you' } },
      effect: [{ gameAction: 'life', who: 'you', delta: 1 }] }],
  },
  'Goblin Guide': {
    name: 'Goblin Guide', types: ['Creature'], power: 2, toughness: 2, keywords: ['Haste'],
    abilities: [{ id: 'goblin-guide#1', kind: 'triggered', when: { event: 'AttackersDeclared', object: 'self' },
      effect: [{ playerTask: "Reveal the top card of your library. If it's a land, put it into your hand.", who: 'defendingPlayer' }] }],
  },
  'Scoured Barrens': {
    name: 'Scoured Barrens', types: ['Land'],
    abilities: [
      { id: 'scoured-barrens#1', kind: 'static', effect: { entersTapped: 'self' } },
      { id: 'scoured-barrens#2', kind: 'triggered', when: { event: 'ZoneChanged', to: 'battlefield', object: 'self' }, effect: [{ gameAction: 'life', who: 'you', delta: 1 }] },
    ],
  },
  'Starting Town': {
    name: 'Starting Town', types: ['Land'],
    abilities: [{ id: 'starting-town#1', kind: 'static', effect: { entersTapped: 'self', unless: { yourTurnOfGame: { atMost: 3 } } } }],
  },
  // A test fixture, not a real card: exercises a creature's own "dies" trigger.
  'Dies Trigger Fixture': {
    name: 'Dies Trigger Fixture', types: ['Creature'], power: 1, toughness: 1,
    abilities: [{ id: 'dies-fixture#1', kind: 'triggered', when: { event: 'ZoneChanged', from: 'battlefield', to: 'graveyard', object: 'self' }, effect: [{ gameAction: 'life', who: 'you', delta: 5 }] }],
  },
  'Savannah Lions': { name: 'Savannah Lions', types: ['Creature'], power: 2, toughness: 1, abilities: [] },
  'Fatal Push': { name: 'Fatal Push', types: ['Instant'], abilities: [] },
};

const newGame = () =>
  createGame([{ id: 'theo', name: 'Theo' }, { id: 'michael', name: 'Michael' }, { id: 'melissa', name: 'Melissa' }, { id: 'elena', name: 'Elena' }], cards);

function act(state: GameState, steps: [GameAction, string][]) {
  const events: GameEvent[] = [];
  for (const [i, [action, playerId]] of steps.entries()) {
    const r = applyAction(state, action, { playerId, cause: { playerStatement: `s${i + 1}` } });
    const s = settle(r.state);
    state = s.state;
    events.push(...r.events, ...s.events);
  }
  return { state, events };
}

const inject = (state: GameState, body: GameEventBody) => {
  const draft = clone(state);
  emit(draft, [], body, { rule: 'turnStructure' });
  return draft;
};

describe('triggers', () => {
  it('Elena’s Savannah Lions: enters tapped from Authority; Case and Authority trigger; APNAP puts Melissa’s on top', () => {
    const state = act(newGame(), [
      [{ type: 'cast', card: 'Authority of the Consuls' }, 'melissa'],
      [{ type: 'cast', card: 'Case of the Uneaten Feast' }, 'elena'],
    ]).state;
    state.turn = { ...state.turn, activePlayerId: 'elena' };
    const r = applyAction(state, { type: 'cast', card: 'Savannah Lions' }, { playerId: 'elena', cause: { playerStatement: 's1' } });
    const beforeResolving = settle(r.state, { resolveStack: false });
    expect(beforeResolving.state.stack).toEqual([expect.objectContaining({ kind: 'spell' })]);

    const s = settle(r.state);
    const entered = s.events.find((e) => e.type === 'ZoneChanged' && e.moves.some((m) => m.card === 'Savannah Lions'))!;
    expect(entered).toMatchObject({ moves: [{ tapped: true, entersTappedBecause: 'authority-of-the-consuls#1' }] });

    const stacked = s.events.filter((e) => e.type === 'AbilityTriggered').map((e) => e.type === 'AbilityTriggered' && e.stackItem.ability);
    expect(stacked).toEqual(['case-of-the-uneaten-feast#1', 'authority-of-the-consuls#2']);

    const gains = s.events.filter((e) => e.type === 'LifeChanged');
    expect(gains.map((e) => e.type === 'LifeChanged' && e.playerId)).toEqual(['melissa', 'elena']);
    expect(gains[0]!.causedBy).toMatchObject({ gameAction: 0, triggeredBy: entered.id });
    expect([s.state.players.melissa!.life, s.state.players.elena!.life]).toEqual([41, 41]);
  });

  it('one entering creature can trigger two abilities: Haliya and Hinterland Sanctifier', () => {
    const { state } = act(newGame(), [
      [{ type: 'cast', card: 'Hinterland Sanctifier' }, 'theo'],
      [{ type: 'cast', card: 'Haliya, Guided by Light' }, 'theo'],
    ]);
    expect(state.players.theo!.life).toBe(42);
  });

  it('a trigger resolves from what it remembers, even after its source is destroyed in response (Goblin Guide)', () => {
    let state = act(newGame(), [[{ type: 'cast', card: 'Goblin Guide' }, 'michael']]).state;
    state = inject(state, { type: 'AttackersDeclared', attacks: [{ attackerId: 'p1', target: 'theo' }] });
    state = settle(state, { resolveStack: false }).state;
    expect(state.stack).toMatchObject([{ kind: 'trigger', ability: 'goblin-guide#1', matched: { attacker: 'p1', defendingPlayer: 'theo' } }]);

    const push = applyAction(state, { type: 'cast', card: 'Fatal Push', targets: ['p1'], effects: [{ type: 'move', objectId: 'p1', to: 'graveyard', how: 'destroy' }] }, { playerId: 'theo', cause: { playerStatement: 's2' } });
    const s = settle(push.state);
    expect(s.state.permanents.p1).toBeUndefined();
    expect(s.tableEvents.find((e) => e.type === 'PlayerTaskCreated')).toMatchObject({ playerId: 'theo', text: expect.stringContaining('Goblin Guide: Reveal the top card') });
    expect(s.events.map((e) => e.type)).not.toContain('PlayerTaskCreated');
  });

  it('a creature’s own "dies" trigger sees it as it left (look-back)', () => {
    const { state } = act(newGame(), [
      [{ type: 'cast', card: 'Dies Trigger Fixture' }, 'theo'],
      [{ type: 'damage', sourceId: 'k9', recipient: { permanentId: 'p1' }, amount: 1 }, 'michael'],
    ]);
    expect(state.permanents.p1).toBeUndefined();
    expect(state.players.theo!.life).toBe(45);
  });

  it('an intervening-if is checked when it would trigger: Haliya draws only after 3 life gained', () => {
    const base = act(newGame(), [[{ type: 'cast', card: 'Haliya, Guided by Light' }, 'theo']]).state;
    const endStep = (s: GameState) => settle(inject(s, { type: 'PhaseStarted', step: 'end', activePlayerId: 'theo', turn: 1 }));
    expect(endStep(base).tableEvents).toEqual([]);

    const more = act(base, [[{ type: 'life', playerId: 'theo', delta: 2 }, 'theo']]).state;
    expect(endStep(more).tableEvents).toMatchObject([{ type: 'PlayerTaskCreated', playerId: 'theo', text: 'Haliya, Guided by Light: Draw a card' }]);
  });

  it('an intervening-if no longer true on resolution does nothing', () => {
    let state = act(newGame(), [
      [{ type: 'cast', card: 'Haliya, Guided by Light' }, 'theo'],
      [{ type: 'life', playerId: 'theo', delta: 2 }, 'theo'],
    ]).state;
    state = settle(inject(state, { type: 'PhaseStarted', step: 'end', activePlayerId: 'theo', turn: 1 }), { resolveStack: false }).state;
    state.gameEventsThisTurn = [];
    const s = settle(state);
    expect(s.events).toMatchObject([{ type: 'StackItemResolved', status: 'conditionNotMet' }]);
  });

  it('Scoured Barrens enters tapped by its own ability and gains 1 when it enters', () => {
    const { state, events } = act(newGame(), [[{ type: 'playLand', card: 'Scoured Barrens' }, 'melissa']]);
    expect(events[0]).toMatchObject({ moves: [{ tapped: true, entersTappedBecause: 'scoured-barrens#1' }] });
    expect(state.players.melissa!.life).toBe(41);
  });

  it('Starting Town enters untapped in a player’s first three turns, then tapped', () => {
    const early = act(newGame(), [[{ type: 'playLand', card: 'Starting Town' }, 'melissa']]);
    expect(early.events[0]!.type === 'ZoneChanged' && early.events[0]!.moves[0]).not.toHaveProperty('tapped');
    const later = newGame();
    later.turn = { number: 15, activePlayerId: 'melissa', step: 'main1' };
    expect(act(later, [[{ type: 'playLand', card: 'Starting Town' }, 'melissa']]).events[0]).toMatchObject({ moves: [{ tapped: true }] });
  });

  it('Authority taps an opponent’s creature tokens as they enter', () => {
    const { state } = act(newGame(), [
      [{ type: 'cast', card: 'Authority of the Consuls' }, 'melissa'],
      [{ type: 'createToken', token: 'Soldier', count: 2, definition: { types: ['Creature'], power: 1, toughness: 1 } }, 'theo'],
    ]);
    const soldiers = Object.values(state.permanents).filter((p) => p.card === 'Soldier');
    expect(soldiers.map((p) => p.tapped)).toEqual([true, true]);
    expect(state.players.melissa!.life).toBe(42);
  });
});

const op = fc.record({
  card: fc.constantFrom('Hinterland Sanctifier', 'Haliya, Guided by Light', 'Authority of the Consuls', 'Case of the Uneaten Feast', 'Savannah Lions', 'Dies Trigger Fixture'),
  player: fc.constantFrom('theo', 'michael', 'melissa', 'elena'),
  kill: fc.boolean(),
  pick: fc.nat(),
});

describe('trigger properties', () => {
  test.prop([fc.array(op, { maxLength: 20 })])('folding the GameEvents from the start still rebuilds the exact state, triggers included', (ops) => {
    let state = newGame();
    const events: GameEvent[] = [];
    for (const [i, o] of ops.entries()) {
      const ids = Object.keys(state.permanents);
      const action: GameAction = o.kill && ids.length
        ? { type: 'damage', sourceId: 'k0', recipient: { permanentId: ids[o.pick % ids.length]! }, amount: 9 }
        : { type: 'cast', card: o.card };
      const r = applyAction(state, action, { playerId: o.player, cause: { playerStatement: `s${i + 1}` } });
      const s = settle(r.state);
      state = s.state;
      events.push(...r.events, ...s.events);
    }
    expect(events.reduce(reduce, newGame())).toEqual(state);
    for (const e of events) {
      if (e.type === 'AbilityTriggered') expect(events.some((x) => 'gameEvent' in e.causedBy && x.id === e.causedBy.gameEvent)).toBe(true);
    }
    expect(state.pendingTriggers).toEqual([]);
    expect(state.stack).toEqual([]);
  });
});
