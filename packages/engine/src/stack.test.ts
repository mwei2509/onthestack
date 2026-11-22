import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import type { GameAction } from './actions.js';
import { applyAction } from './apply.js';
import type { CardDefinition } from './cards.js';
import type { GameEvent } from './events.js';
import { createGame } from './game.js';
import { settle } from './settle.js';
import type { GameState } from './state.js';

const cards: Record<string, CardDefinition> = {
  'Grizzly Bears': { name: 'Grizzly Bears', types: ['Creature'], power: 2, toughness: 2, abilities: [] },
  'Savannah Lions': { name: 'Savannah Lions', types: ['Creature'], power: 2, toughness: 1, abilities: [] },
  'Fatal Push': { name: 'Fatal Push', types: ['Instant'], abilities: [] },
  Murder: { name: 'Murder', types: ['Instant'], abilities: [] },
  Counterspell: { name: 'Counterspell', types: ['Instant'], abilities: [] },
  'Healing Salve': { name: 'Healing Salve', types: ['Instant'], abilities: [] },
};

const newGame = () => createGame([{ id: 'theo', name: 'Theo' }, { id: 'melissa', name: 'Melissa' }], cards);

/** Applies GameActions without resolving anything, the way Responses pile up before the table moves on. */
function say(state: GameState, steps: [GameAction, string][]): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  steps.forEach(([action, playerId], i) => {
    const r = applyAction(state, action, { playerId, cause: { playerStatement: `s${i + 1}` } });
    state = r.state;
    events.push(...r.events);
  });
  return { state, events };
}

const destroy = (objectId: string): GameAction => ({ type: 'move', objectId, to: 'graveyard', how: 'destroy' });

describe('the Stack', () => {
  it('resolves last in, first out', () => {
    const { state } = say(newGame(), [
      [{ type: 'cast', card: 'Grizzly Bears' }, 'theo'],
      [{ type: 'cast', card: 'Healing Salve', effects: [{ type: 'life', playerId: 'melissa', delta: 3 }] }, 'melissa'],
    ]);
    const r = settle(state);
    const resolved = r.events.filter((e) => e.type === 'StackItemResolved').map((e) => (e as { stackItemId: string }).stackItemId);
    expect(resolved).toEqual(['k2', 'k1']);
    expect(r.state.players.melissa!.life).toBe(43);
    expect(r.state.permanents.p1?.card).toBe('Grizzly Bears');
  });

  it('a spell’s effects are caused by its Stack item, in order', () => {
    const { state } = say(newGame(), [
      [{ type: 'cast', card: 'Healing Salve', effects: [{ type: 'life', playerId: 'melissa', delta: 2 }, { type: 'life', playerId: 'melissa', delta: 1 }] }, 'melissa'],
    ]);
    const lifeEvents = settle(state).events.filter((e) => e.type === 'LifeChanged');
    expect(lifeEvents.map((e) => e.causedBy)).toEqual([
      { stackItem: 'k1', gameAction: 0 },
      { stackItem: 'k1', gameAction: 1 },
    ]);
  });

  it('a countered spell goes to the graveyard and never resolves', () => {
    const { state, events } = say(newGame(), [
      [{ type: 'cast', card: 'Grizzly Bears' }, 'theo'],
      [{ type: 'cast', card: 'Counterspell', targets: ['k1'], effects: [{ type: 'counter', stackItemId: 'k1' }] }, 'melissa'],
    ]);
    expect(events.map((e) => e.type)).toEqual(['SpellCast', 'SpellCast']);
    const r = settle(state);
    expect(r.state.permanents).toEqual({});
    expect(r.state.graveyards.theo).toEqual(['Grizzly Bears']);
    expect(r.events.find((e) => e.type === 'StackItemResolved' && e.stackItemId === 'k1')).toMatchObject({ status: 'countered', causedBy: { stackItem: 'k2', gameAction: 0 } });
  });

  it('a spell whose target is gone fizzles, and its effect never happens', () => {
    const setup = settle(say(newGame(), [[{ type: 'cast', card: 'Savannah Lions' }, 'melissa']]).state).state;
    const { state } = say(setup, [
      [{ type: 'cast', card: 'Fatal Push', targets: ['p1'], effects: [destroy('p1')] }, 'theo'],
      [{ type: 'cast', card: 'Murder', targets: ['p1'], effects: [destroy('p1')] }, 'theo'],
    ]);
    const r = settle(state);
    expect(r.events.filter((e) => e.type === 'StackItemResolved').map((e) => [(e as { stackItemId: string }).stackItemId, (e as { status: string }).status])).toEqual([
      ['k3', 'resolved'],
      ['k2', 'fizzled'],
    ]);
    expect(r.events.find((e) => e.type === 'ZoneChanged' && e.moves.some((m) => m.card === 'Fatal Push'))).toMatchObject({ to: 'graveyard', how: 'fizzled' });
    expect(r.warnings).toEqual([]);
    expect(r.state.graveyards).toEqual({ theo: ['Murder', 'Fatal Push'], melissa: ['Savannah Lions'] });
  });

  it('settling without resolving the Stack leaves room for a Response', () => {
    const { state } = say(newGame(), [[{ type: 'cast', card: 'Grizzly Bears' }, 'theo']]);
    const r = settle(state, { resolveStack: false });
    expect(r.events).toEqual([]);
    expect(r.state.stack).toHaveLength(1);
  });

  it('countering something that isn’t on the stack is flagged, not guessed', () => {
    const r = applyAction(newGame(), { type: 'counter', stackItemId: 'k9' }, { playerId: 'melissa', cause: { playerStatement: 's1' } });
    expect(r.events).toEqual([]);
    expect(r.warnings).toMatchObject([{ code: 'notOnStack' }]);
  });
});

const castOp = fc.record({
  card: fc.constantFrom('Grizzly Bears', 'Savannah Lions', 'Healing Salve', 'Murder'),
  player: fc.constantFrom('theo', 'melissa'),
  pick: fc.nat(),
});

describe('Stack properties', () => {
  test.prop([fc.array(castOp, { minLength: 1, maxLength: 12 })])('after settling, the Stack is empty and items resolved in reverse cast order', (ops) => {
    let state = newGame();
    const cast: string[] = [];
    for (const o of ops) {
      const r = applyAction(state, { type: 'cast', card: o.card, effects: o.card === 'Healing Salve' ? [{ type: 'life', playerId: o.player, delta: 1 }] : [] }, { playerId: o.player, cause: { playerStatement: 's1' } });
      state = r.state;
      const spellCast = r.events.find((e) => e.type === 'SpellCast');
      if (spellCast?.type === 'SpellCast') cast.push(spellCast.stackItemId);
    }
    const r = settle(state);
    expect(r.state.stack).toEqual([]);
    const resolved = r.events.filter((e) => e.type === 'StackItemResolved').map((e) => (e as { stackItemId: string }).stackItemId);
    expect(resolved).toEqual([...cast].reverse());
  });
});
