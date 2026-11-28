import { describe, expect, it } from 'vitest';
import type { GameAction } from './actions.js';
import { applyAction } from './apply.js';
import type { CardDefinition, EntersUntappedIf } from './cards.js';
import { createGame } from './game.js';
import { settle } from './settle.js';
import type { GameState } from './state.js';

const land = (name: string, subtypes: string[], unless?: EntersUntappedIf): CardDefinition => ({
  name, types: ['Land'], subtypes,
  abilities: unless ? [{ id: `${name}#1`, kind: 'static', effect: { entersTapped: 'self', unless } }] : [],
});

const cards: Record<string, CardDefinition> = {
  'Godless Shrine': land('Godless Shrine', ['Plains', 'Swamp'], { payLife: 2 }),
  'Drowned Catacomb': land('Drowned Catacomb', [], { youControl: { filter: { types: ['Land'], subtypes: ['Island', 'Swamp'] }, atLeast: 1 } }),
  'Blooming Marsh': land('Blooming Marsh', [], { youControl: { filter: { types: ['Land'] }, atMost: 2 } }),
  'Morphic Pool': land('Morphic Pool', [], { opponents: { atLeast: 2 } }),
  Island: land('Island', ['Island']),
  Forest: land('Forest', ['Forest']),
};

const game = (players = 3) =>
  createGame([{ id: 'theo', name: 'Theo' }, { id: 'michael', name: 'Michael' }, { id: 'elena', name: 'Elena' }].slice(0, players), cards);

function play(state: GameState, steps: GameAction[]) {
  const results = [];
  for (const [i, action] of steps.entries()) {
    const r = applyAction(state, action, { playerId: 'theo', cause: { playerStatement: `s${i + 1}` } });
    state = settle(r.state).state;
    results.push(r);
  }
  return { state, last: results.at(-1)! };
}

const tapped = (state: GameState, card: string) => Object.values(state.permanents).filter((p) => p.card === card).map((p) => p.tapped);

describe('lands that enter tapped unless (ADR 0131, 0133)', () => {
  it('Godless Shrine enters tapped when nobody said they paid, and the engine takes no life', () => {
    const { state } = play(game(), [{ type: 'playLand', card: 'Godless Shrine' }]);
    expect(tapped(state, 'Godless Shrine')).toEqual([true]);
    expect(state.players.theo!.life).toBe(40);
  });

  it('Godless Shrine enters untapped when its controller said they paid 2 life', () => {
    const { state, last } = play(game(), [{ type: 'playLand', card: 'Godless Shrine', payLife: true }]);
    expect(tapped(state, 'Godless Shrine')).toEqual([false]);
    expect(state.players.theo!.life).toBe(38);
    expect(last.events[0]).toMatchObject({ type: 'LifeChanged', playerId: 'theo', delta: -2, reason: 'payment' });
  });

  it('saying they paid for a land that asks for nothing raises a warning and costs nothing', () => {
    const { state, last } = play(game(), [{ type: 'playLand', card: 'Forest', payLife: true }]);
    expect(state.players.theo!.life).toBe(40);
    expect(last.warnings).toMatchObject([{ code: 'nothingToPay' }]);
  });

  it('Drowned Catacomb enters untapped only when you control an Island or a Swamp', () => {
    expect(tapped(play(game(), [{ type: 'playLand', card: 'Forest' }, { type: 'playLand', card: 'Drowned Catacomb' }]).state, 'Drowned Catacomb')).toEqual([true]);
    expect(tapped(play(game(), [{ type: 'playLand', card: 'Island' }, { type: 'playLand', card: 'Drowned Catacomb' }]).state, 'Drowned Catacomb')).toEqual([false]);
    expect(tapped(play(game(), [{ type: 'playLand', card: 'Godless Shrine' }, { type: 'playLand', card: 'Drowned Catacomb' }]).state, 'Drowned Catacomb')).toEqual([false]);
  });

  it('Blooming Marsh enters untapped with two or fewer other lands, tapped with three', () => {
    const forests = (n: number): GameAction[] => Array.from({ length: n }, () => ({ type: 'playLand', card: 'Forest' }));
    expect(tapped(play(game(), [...forests(2), { type: 'playLand', card: 'Blooming Marsh' }]).state, 'Blooming Marsh')).toEqual([false]);
    expect(tapped(play(game(), [...forests(3), { type: 'playLand', card: 'Blooming Marsh' }]).state, 'Blooming Marsh')).toEqual([true]);
  });

  it('Morphic Pool enters untapped with two or more opponents still in the game', () => {
    expect(tapped(play(game(3), [{ type: 'playLand', card: 'Morphic Pool' }]).state, 'Morphic Pool')).toEqual([false]);
    expect(tapped(play(game(2), [{ type: 'playLand', card: 'Morphic Pool' }]).state, 'Morphic Pool')).toEqual([true]);
    const oneLeft = game(3);
    oneLeft.players.elena!.out = true;
    expect(tapped(play(oneLeft, [{ type: 'playLand', card: 'Morphic Pool' }]).state, 'Morphic Pool')).toEqual([true]);
  });
});
