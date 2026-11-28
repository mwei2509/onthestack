import { describe, expect, it } from 'vitest';
import type { GameAction } from './actions.js';
import { applyAction } from './apply.js';
import type { CardDefinition, TriggerCondition } from './cards.js';
import { clone } from './clone.js';
import { emit } from './emit.js';
import type { GameEventBody, TableEventDraft } from './events.js';
import { createGame } from './game.js';
import { settle } from './settle.js';
import type { GameState } from './state.js';

const entersUnderYou: TriggerCondition = { event: 'ZoneChanged', to: 'battlefield', object: { types: ['Creature'], controller: 'you' } };

const cards: Record<string, CardDefinition> = {
  'Blood Artist': {
    name: 'Blood Artist', types: ['Creature'], power: 0, toughness: 1,
    abilities: [{ id: 'blood-artist#1', kind: 'triggered',
      when: { event: 'ZoneChanged', from: 'battlefield', to: 'graveyard', object: { selfOr: { types: ['Creature'] } } },
      targets: [{ id: 't1', kind: 'player', player: 'any' }],
      effect: [{ gameAction: 'life', who: { target: 't1' }, amount: 1, lose: true }, { gameAction: 'life', who: 'you', amount: 1 }] }],
  },
  'Impact Tremors': {
    name: 'Impact Tremors', types: ['Enchantment'],
    abilities: [{ id: 'impact-tremors#1', kind: 'triggered', when: entersUnderYou, effect: [{ gameAction: 'damage', to: 'eachOpponent', amount: 1 }] }],
  },
  "Ajani's Pridemate": {
    name: "Ajani's Pridemate", types: ['Creature'], power: 2, toughness: 2,
    abilities: [{ id: 'ajanis-pridemate#1', kind: 'triggered', optional: true,
      when: { event: 'LifeChanged', player: 'you', gained: true },
      effect: [{ gameAction: 'counters', object: 'self', kind: '+1/+1', amount: 1 }] }],
  },
  'Siege-Gang Commander': {
    name: 'Siege-Gang Commander', types: ['Creature'], power: 2, toughness: 2,
    abilities: [{ id: 'siege-gang-commander#1', kind: 'triggered', when: { event: 'ZoneChanged', to: 'battlefield', object: 'self' },
      effect: [{ gameAction: 'createToken', token: 'Goblin', definition: { types: ['Creature'], power: 1, toughness: 1 }, count: 3 }] }],
  },
  'Coastal Piracy': {
    name: 'Coastal Piracy', types: ['Enchantment'],
    abilities: [{ id: 'coastal-piracy#1', kind: 'triggered', optional: true,
      when: { event: 'DamageDealt', combat: true, player: 'opponent', object: { types: ['Creature'], controller: 'you' } },
      effect: [{ oracle: 'Whenever a creature you control deals combat damage to an opponent, you may draw a card.' }] }],
  },
  // Test fixtures, not real cards.
  'Pump Fixture': {
    name: 'Pump Fixture', types: ['Creature'], power: 2, toughness: 2,
    abilities: [{ id: 'pump#1', kind: 'triggered', when: { event: 'AttackersDeclared', object: 'self' },
      effect: [{ gameAction: 'modify', object: 'self', power: 2, toughness: 0, keywords: ['Trample'] }] }],
  },
  'Count Fixture': {
    name: 'Count Fixture', types: ['Enchantment'],
    abilities: [{ id: 'count#1', kind: 'triggered', when: { event: 'PhaseStarted', step: 'end', whose: 'you' },
      effect: [{ gameAction: 'life', who: 'you', amount: { count: { types: ['Creature'], controller: 'you' } } }] }],
  },
  'Power Fixture': {
    name: 'Power Fixture', types: ['Enchantment'],
    abilities: [{ id: 'power#1', kind: 'triggered', when: entersUnderYou,
      effect: [{ gameAction: 'life', who: 'you', amount: { powerOf: 'matched' } }] }],
  },
  'X Fixture': {
    name: 'X Fixture', types: ['Enchantment'],
    abilities: [{ id: 'x#1', kind: 'triggered', when: entersUnderYou, effect: [{ gameAction: 'life', who: 'you', amount: { x: true } }] }],
  },
  'Savannah Lions': { name: 'Savannah Lions', types: ['Creature'], power: 2, toughness: 1, abilities: [] },
  'Serra Angel': { name: 'Serra Angel', types: ['Creature'], power: 4, toughness: 4, abilities: [] },
};

const newGame = () => createGame([{ id: 'theo', name: 'Theo' }, { id: 'michael', name: 'Michael' }, { id: 'elena', name: 'Elena' }], cards);

function act(state: GameState, steps: [GameAction, string][]) {
  const tableEvents: TableEventDraft[] = [];
  for (const [i, [action, playerId]] of steps.entries()) {
    const s = settle(applyAction(state, action, { playerId, cause: { playerStatement: `s${i + 1}` } }).state);
    state = s.state;
    tableEvents.push(...s.tableEvents);
  }
  return { state, tableEvents };
}

const inject = (state: GameState, body: GameEventBody, resolveStack = true) => {
  const draft = clone(state);
  emit(draft, [], body, { rule: 'turnStructure' });
  return settle(draft, { resolveStack });
};

const lifeOf = (state: GameState) => Object.fromEntries(Object.values(state.players).map((p) => [p.id, p.life]));
const idOf = (state: GameState, card: string) => Object.values(state.permanents).find((p) => p.card === card)!.id;

describe('Translation v2 effects', () => {
  it('Blood Artist: the unnamed target becomes a PlayerTask, and "you gain 1" applies', () => {
    const { state, tableEvents } = act(newGame(), [
      [{ type: 'cast', card: 'Blood Artist' }, 'theo'],
      [{ type: 'cast', card: 'Savannah Lions' }, 'michael'],
      [{ type: 'damage', sourceId: 'k0', recipient: { permanentId: 'p2' }, amount: 5 }, 'elena'],
    ]);
    expect(lifeOf(state)).toEqual({ theo: 41, michael: 40, elena: 40 });
    expect(tableEvents).toMatchObject([{ type: 'PlayerTaskCreated', playerId: 'theo', text: 'Blood Artist: choose a player to lose 1 life, and say who.' }]);
  });

  it('Impact Tremors deals 1 damage to each opponent still in the game, from itself', () => {
    const state = act(newGame(), [[{ type: 'cast', card: 'Impact Tremors' }, 'theo']]).state;
    state.players.elena!.out = true;
    const s = settle(applyAction(state, { type: 'cast', card: 'Savannah Lions' }, { playerId: 'theo', cause: { playerStatement: 's2' } }).state);
    expect(lifeOf(s.state)).toEqual({ theo: 40, michael: 39, elena: 40 });
    expect(s.events.find((e) => e.type === 'DamageDealt')).toMatchObject({ damage: [{ sourceId: idOf(s.state, 'Impact Tremors'), recipient: { playerId: 'michael' }, amount: 1 }] });
  });

  it('"you may" is applied unless a player says otherwise, and the Stack item says it was optional', () => {
    const state = act(newGame(), [[{ type: 'cast', card: "Ajani's Pridemate" }, 'theo']]).state;
    const draft = clone(state);
    const r = applyAction(draft, { type: 'life', playerId: 'theo', delta: 2 }, { playerId: 'theo', cause: { playerStatement: 's2' } });
    const stacked = settle(r.state, { resolveStack: false }).state;
    expect(stacked.stack).toMatchObject([{ ability: 'ajanis-pridemate#1', optional: true }]);
    expect(settle(stacked).state.permanents[idOf(state, "Ajani's Pridemate")]!.counters).toEqual({ '+1/+1': 1 });
  });

  it('Siege-Gang Commander creates three Goblin tokens', () => {
    const { state } = act(newGame(), [[{ type: 'cast', card: 'Siege-Gang Commander' }, 'theo']]);
    expect(Object.values(state.permanents).filter((p) => p.card === 'Goblin' && p.isToken && p.controllerId === 'theo')).toHaveLength(3);
  });

  it('a pump gives the source +2/+0 and trample until end of turn', () => {
    let state = act(newGame(), [[{ type: 'cast', card: 'Pump Fixture' }, 'theo']]).state;
    const id = idOf(state, 'Pump Fixture');
    state = inject(state, { type: 'AttackersDeclared', attacks: [{ attackerId: id, target: 'michael' }] }).state;
    expect(state.permanents[id]!.effects).toMatchObject([{ kind: 'add', power: 2, toughness: 0, keywords: ['Trample'], until: 'endOfTurn' }]);
  });

  it('an Oracle reminder rides on the Stack item and creates no PlayerTask', () => {
    const state = act(newGame(), [[{ type: 'cast', card: 'Coastal Piracy' }, 'theo'], [{ type: 'cast', card: 'Savannah Lions' }, 'theo']]).state;
    const lions = idOf(state, 'Savannah Lions');
    const stacked = inject(state, { type: 'DamageDealt', damage: [{ sourceId: lions, recipient: { playerId: 'michael' }, amount: 2, combat: true }] }, false).state;
    expect(stacked.stack).toMatchObject([{ ability: 'coastal-piracy#1', gameActions: [], reminders: ['Whenever a creature you control deals combat damage to an opponent, you may draw a card.'] }]);
    expect(settle(stacked).tableEvents).toEqual([]);
  });

  it('a counted amount is counted again as it resolves (CR 608.2h)', () => {
    let state = act(newGame(), [[{ type: 'cast', card: 'Count Fixture' }, 'theo'], [{ type: 'cast', card: 'Savannah Lions' }, 'theo']]).state;
    state = inject(state, { type: 'PhaseStarted', step: 'end', activePlayerId: 'theo', turn: 1 }, false).state;
    expect(state.stack[0]!.gameActions).toEqual([{ type: 'life', playerId: 'theo', delta: 1 }]);
    const responded = clone(state);
    responded.permanents.p99 = { ...responded.permanents[idOf(state, 'Savannah Lions')]!, id: 'p99' };
    expect(settle(responded).state.players.theo!.life).toBe(42);
  });

  it('"equal to its power" reads the matched creature', () => {
    const { state } = act(newGame(), [[{ type: 'cast', card: 'Power Fixture' }, 'theo'], [{ type: 'cast', card: 'Serra Angel' }, 'theo']]);
    expect(state.players.theo!.life).toBe(44);
  });

  it('an amount the engine cannot know becomes a PlayerTask, never a guess', () => {
    const { state, tableEvents } = act(newGame(), [[{ type: 'cast', card: 'X Fixture' }, 'theo'], [{ type: 'cast', card: 'Savannah Lions' }, 'theo']]);
    expect(state.players.theo!.life).toBe(40);
    expect(tableEvents).toMatchObject([{ type: 'PlayerTaskCreated', playerId: 'theo', text: 'X Fixture: say how much life is gained.' }]);
  });
});
