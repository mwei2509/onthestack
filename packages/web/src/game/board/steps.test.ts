import { describe, expect, it } from 'vitest';
import { nextPlayerId, stepTrack } from './steps.js';

const player = (id: string, out = false) => ({ id, name: id, life: 40, poison: 0, commanderDamage: {}, out });

describe('step track', () => {
  it('marks Steps done, current and ahead, and names the phase', () => {
    const track = stepTrack({ turn: { number: 1, activePlayerId: 'a', step: 'declareAttackers' }, stepsAhead: ['endOfCombat', 'main2', 'end', 'cleanup'] });
    expect(track.phase).toBe('Combat');
    const combat = track.phases[2]!.steps;
    expect(combat.map((s) => [s.step, s.state])).toEqual([
      ['beginningOfCombat', 'done'],
      ['declareAttackers', 'current'],
      ['declareBlockers', 'ahead'],
      ['combatDamage', 'ahead'],
      ['endOfCombat', 'ahead'],
    ]);
  });

  it('shows first-strike damage only when it happens this turn', () => {
    const track = stepTrack({ turn: { number: 1, activePlayerId: 'a', step: 'declareBlockers' }, stepsAhead: ['firstStrikeDamage', 'combatDamage'] });
    expect(track.phases[2]!.steps.map((s) => s.step)).toContain('firstStrikeDamage');
  });
});

describe('next player', () => {
  it('skips players who are out', () => {
    const players = { a: player('a'), b: player('b', true), c: player('c') };
    expect(nextPlayerId({ turn: { number: 1, activePlayerId: 'a', step: 'end' }, players })).toBe('c');
    expect(nextPlayerId({ turn: { number: 1, activePlayerId: 'c', step: 'end' }, players })).toBe('a');
  });
});
