import type { TableView } from '@onthestack/engine';
import { describe, expect, it } from 'vitest';
import { boardPlayers, endedLine } from './model.js';

const player = (id: string, name: string) => ({ id, name, life: 40, poison: 0, commanderDamage: {}, out: false });
const view = {
  turn: { number: 7, activePlayerId: 'p2', step: 'combatDamage' },
  players: { p1: player('p1', 'Melissa'), p2: player('p2', 'Theo') },
  commandZone: {},
} as unknown as TableView;
const seats = [
  { id: 'p1', name: 'Melissa', connected: true },
  { id: 'p2', name: 'Theo', connected: true },
];

describe('an ended game on the board (ADR 0102)', () => {
  it('has no active player', () => {
    expect(boardPlayers(view, seats).map((p) => p.active)).toEqual([false, true]);
    expect(boardPlayers(view, seats, true).map((p) => p.active)).toEqual([false, false]);
  });

  it('says when it ended, in which turn and whose', () => {
    const line = endedLine({ at: '2026-11-24T21:42:00Z', turn: 7, by: 'p1' }, view, (at) => at.toISOString().slice(11, 16));
    expect(line).toBe("Ended on turn 7, in Theo's turn · 21:42");
  });
});
