import { describe, expect, it } from 'vitest';
import type { GameAction } from './actions.js';
import { applyAction } from './apply.js';
import type { CardDefinition, ObjectFilter, TriggeredAbility } from './cards.js';
import { clone } from './clone.js';
import { emit } from './emit.js';
import type { GameEventBody } from './events.js';
import { createGame } from './game.js';
import { settle } from './settle.js';
import type { GameState } from './state.js';

const creatures: Record<string, CardDefinition> = {
  'Llanowar Elves': { name: 'Llanowar Elves', types: ['Creature'], subtypes: ['Elf', 'Druid'], colors: ['G'], power: 1, toughness: 1, abilities: [] },
  'Serra Angel': { name: 'Serra Angel', types: ['Creature'], subtypes: ['Angel'], colors: ['W'], power: 4, toughness: 4, abilities: [] },
  'Isamaru, Hound of Konda': { name: 'Isamaru, Hound of Konda', types: ['Creature'], subtypes: ['Dog'], legendary: true, colors: ['W'], power: 2, toughness: 2, abilities: [] },
  Tarmogoyf: { name: 'Tarmogoyf', types: ['Creature'], subtypes: ['Lhurgoyf'], colors: ['G'], power: 0, toughness: 1, ptVaries: true, abilities: [] },
  Forest: { name: 'Forest', types: ['Land'], subtypes: ['Forest'], abilities: [] },
};

// Test fixtures, not real cards: each gains its controller 1 life when its one ability triggers.
const fixture = (name: string, ability: Omit<TriggeredAbility, 'id' | 'kind' | 'effect'>, types = ['Enchantment']): CardDefinition => ({
  name,
  types,
  ...(types.includes('Creature') ? { power: 2, toughness: 2 } : {}),
  abilities: [{ id: `${name}#1`, kind: 'triggered', effect: [{ gameAction: 'life', who: 'you', amount: 1 }], ...ability }],
});

const entersUnderYou = (object: ObjectFilter) => ({ when: { event: 'ZoneChanged' as const, to: 'battlefield' as const, object: { types: ['Creature'], controller: 'you' as const, ...object } } });

function game(extra: CardDefinition[], commander?: string): GameState {
  const cards = { ...creatures, ...Object.fromEntries(extra.map((c) => [c.name, c])) };
  return createGame([{ id: 'theo', name: 'Theo', ...(commander ? { commander } : {}) }, { id: 'michael', name: 'Michael' }], cards);
}

function act(state: GameState, steps: [GameAction, string][]): GameState {
  for (const [i, [action, playerId]] of steps.entries()) state = settle(applyAction(state, action, { playerId, cause: { playerStatement: `s${i + 1}` } }).state).state;
  return state;
}

const inject = (state: GameState, body: GameEventBody) => {
  const draft = clone(state);
  emit(draft, [], body, { rule: 'turnStructure' });
  return settle(draft).state;
};

const life = (state: GameState) => state.players.theo!.life;

describe('Translation v2 trigger matching', () => {
  it.each<[string, ObjectFilter, string[]]>([
    ['subtypes', { subtypes: ['Elf'] }, ['Llanowar Elves']],
    ['power', { power: { atLeast: 4 } }, ['Serra Angel']],
    ['legendary', { legendary: true }, ['Isamaru, Hound of Konda']],
    ['colours', { colors: ['W'] }, ['Serra Angel', 'Isamaru, Hound of Konda']],
    ['name', { name: 'Serra Angel' }, ['Serra Angel']],
    ['token', { token: false }, ['Llanowar Elves', 'Serra Angel', 'Isamaru, Hound of Konda', 'Tarmogoyf']],
  ])('filters by %s', (_, filter, expected) => {
    const watcher = fixture('Watcher', entersUnderYou(filter));
    const casts = ['Llanowar Elves', 'Serra Angel', 'Isamaru, Hound of Konda', 'Tarmogoyf'];
    let state = act(game([watcher]), [[{ type: 'cast', card: 'Watcher' }, 'theo']]);
    const triggeredBy: string[] = [];
    for (const card of casts) {
      const before = life(state);
      state = act(state, [[{ type: 'cast', card }, 'theo']]);
      if (life(state) > before) triggeredBy.push(card);
    }
    expect(triggeredBy).toEqual(expected);
  });

  it('a token filter matches created tokens', () => {
    const watcher = fixture('Watcher', entersUnderYou({ token: true }));
    const state = act(game([watcher]), [
      [{ type: 'cast', card: 'Watcher' }, 'theo'],
      [{ type: 'cast', card: 'Serra Angel' }, 'theo'],
      [{ type: 'createToken', token: 'Soldier', count: 2, definition: { types: ['Creature'], power: 1, toughness: 1 } }, 'theo'],
    ]);
    expect(life(state)).toBe(42);
  });

  it('a power filter never matches a creature whose power varies', () => {
    const watcher = fixture('Watcher', entersUnderYou({ power: { atMost: 5 } }));
    expect(life(act(game([watcher]), [[{ type: 'cast', card: 'Watcher' }, 'theo'], [{ type: 'cast', card: 'Tarmogoyf' }, 'theo']]))).toBe(40);
  });

  it('several whens: enters or attacks', () => {
    const striker = fixture('Striker', { when: [{ event: 'ZoneChanged', to: 'battlefield', object: 'self' }, { event: 'AttackersDeclared', object: 'self' }] }, ['Creature']);
    let state = act(game([striker]), [[{ type: 'cast', card: 'Striker' }, 'theo']]);
    expect(life(state)).toBe(41);
    state = inject(state, { type: 'AttackersDeclared', attacks: [{ attackerId: 'p1', target: 'michael' }] });
    expect(life(state)).toBe(42);
  });

  it('once each turn: a second match in the same turn does not trigger', () => {
    const once = fixture('Once', { ...entersUnderYou({}), limit: { perTurn: 1 } });
    let state = act(game([once]), [
      [{ type: 'cast', card: 'Once' }, 'theo'],
      [{ type: 'cast', card: 'Llanowar Elves' }, 'theo'],
      [{ type: 'cast', card: 'Serra Angel' }, 'theo'],
    ]);
    expect(life(state)).toBe(41);
    state = inject(state, { type: 'PhaseStarted', step: 'untap', activePlayerId: 'michael', turn: 2 });
    state.gameEventsThisTurn = [];
    expect(life(act(state, [[{ type: 'cast', card: 'Isamaru, Hound of Konda' }, 'theo']]))).toBe(42);
  });

  it('once each turn counts two matches from the same GameEvent', () => {
    const once = fixture('Once', { ...entersUnderYou({}), limit: { perTurn: 1 } });
    const state = act(game([once]), [
      [{ type: 'cast', card: 'Once' }, 'theo'],
      [{ type: 'createToken', token: 'Soldier', count: 3, definition: { types: ['Creature'], power: 1, toughness: 1 } }, 'theo'],
    ]);
    expect(life(state)).toBe(41);
  });

  it('a trigger-only condition is checked when it triggers, not again on resolution', () => {
    const gated = (key: 'if' | 'condition') => fixture(`Gated ${key}`, { when: { event: 'PhaseStarted', step: 'end', whose: 'you' }, [key]: { youControl: { filter: { types: ['Land'] }, atLeast: 1 } } });
    for (const [key, expected] of [['condition', 'resolved'], ['if', 'conditionNotMet']] as const) {
      let state = act(game([gated(key)]), [[{ type: 'cast', card: `Gated ${key}` }, 'theo']]);
      const draft = clone(state);
      emit(draft, [], { type: 'PhaseStarted', step: 'end', activePlayerId: 'theo', turn: 1 }, { rule: 'turnStructure' });
      expect(settle(draft, { resolveStack: false }).state.stack).toEqual([]);

      state = act(state, [[{ type: 'playLand', card: 'Forest' }, 'theo']]);
      const ready = clone(state);
      emit(ready, [], { type: 'PhaseStarted', step: 'end', activePlayerId: 'theo', turn: 1 }, { rule: 'turnStructure' });
      const stacked = settle(ready, { resolveStack: false }).state;
      expect(stacked.stack).toHaveLength(1);
      const forest = Object.values(stacked.permanents).find((p) => p.card === 'Forest')!;
      const gone = settle(stacked, { resolveStack: false }).state;
      delete gone.permanents[forest.id];
      expect(settle(gone).events).toContainEqual(expect.objectContaining({ type: 'StackItemResolved', status: expected }));
    }
  });

  it('a condition reads tapped and attacking permanents', () => {
    const tappedOut = fixture('Tapped Watcher', { when: { event: 'PhaseStarted', step: 'end', whose: 'you' }, condition: { youControl: { filter: { tapped: true, attacking: true }, atLeast: 1 } } });
    let state = act(game([tappedOut]), [[{ type: 'cast', card: 'Tapped Watcher' }, 'theo'], [{ type: 'cast', card: 'Serra Angel' }, 'theo']]);
    const angel = Object.values(state.permanents).find((p) => p.card === 'Serra Angel')!;
    const endStep = (s: GameState) => life(inject(s, { type: 'PhaseStarted', step: 'end', activePlayerId: 'theo', turn: 1 }));
    expect(endStep(state)).toBe(40);
    state = inject(state, { type: 'AttackersDeclared', attacks: [{ attackerId: angel.id, target: 'michael' }] });
    expect(endStep(state)).toBe(40);
    state.permanents[angel.id]!.tapped = true;
    expect(endStep(state)).toBe(41);
  });

  it('an ability that works from the graveyard triggers there, and not on the battlefield', () => {
    const haunt = fixture('Haunt', { zone: 'graveyard', when: { event: 'ZoneChanged', to: 'battlefield', object: { types: ['Land'], controller: 'you' } } }, ['Creature']);
    let state = act(game([haunt]), [[{ type: 'cast', card: 'Haunt' }, 'theo'], [{ type: 'playLand', card: 'Forest' }, 'theo']]);
    expect(life(state)).toBe(40);
    state = act(state, [[{ type: 'damage', sourceId: 'k0', recipient: { permanentId: 'p1' }, amount: 9 }, 'michael']]);
    expect(state.graveyards.theo).toContain('Haunt');
    expect(life(act(state, [[{ type: 'playLand', card: 'Forest' }, 'theo']]))).toBe(41);
  });

  it('an ability that works from the command zone triggers while the commander is there', () => {
    const general = fixture('General', { zone: 'command', when: { event: 'PhaseStarted', step: 'upkeep', whose: 'you' } }, ['Creature']);
    const state = inject(game([general], 'General'), { type: 'PhaseStarted', step: 'upkeep', activePlayerId: 'theo', turn: 1 });
    expect(life(state)).toBe(41);
  });
});
