import { describe, expect, it } from 'vitest';
import { quickAnswers } from './TurnLog.js';

const player = (id: string, name: string, out = false) => ({ id, name, life: 40, poison: 0, commanderDamage: {}, out });
const view = { players: { p1: player('p1', 'Theo'), p2: player('p2', 'Elena', true), p3: player('p3', 'Ana') } };
const q = (kind: string, options?: string[]) => ({ kind, askPlayer: 'p1', text: 'Which?', about: ['s1'], ...(options ? { options } : {}) }) as Parameters<typeof quickAnswers>[0];

describe('quick answers', () => {
  it("offers the question's own options first", () => {
    expect(quickAnswers(q('chooseOption', ['Serra Angel', 'Savannah Lions']), view)).toEqual(['Serra Angel', 'Savannah Lions']);
  });

  it('offers Yes and No for a yes-or-no question', () => {
    expect(quickAnswers(q('yesNo'), view)).toEqual(['Yes', 'No']);
  });

  it('offers the players still in the game for "which player?"', () => {
    expect(quickAnswers(q('choosePlayers'), view)).toEqual(['Theo', 'Ana']);
  });

  it('offers nothing it would have to make up', () => {
    expect(quickAnswers(q('chooseObjects'), view)).toEqual([]);
    expect(quickAnswers(q('chooseNumber'), view)).toEqual([]);
  });
});
