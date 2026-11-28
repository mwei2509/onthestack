import type { ReadbackNote } from '@onthestack/engine';
import { describe, expect, it } from 'vitest';
import { nextTray, type TrayState } from './useNoteTray.js';

const note = (delta: number): ReadbackNote => ({ cause: { followsFrom: 'statement' }, entry: { playerStatement: 's1' }, effects: [{ type: 'life', playerId: 'a', delta, reason: 'loss' }] });
const start: TrayState = { reading: '1:0:0', turn: 1, notes: [], openKeys: [], dismissed: [] };

describe('nextTray (ADR 0136)', () => {
  it('opens the notes a new reading brought', () => {
    const tray = nextTray(start, '1:1:0', 1, [note(-1)]);
    expect(tray.openKeys).toHaveLength(1);
  });

  it('closes notes from before when the next reading lands, and forgets dismissals', () => {
    const first = { ...nextTray(start, '1:1:0', 1, [note(-1)]), dismissed: ['x'] };
    const second = nextTray(first, '1:2:0', 1, [note(-1), note(-2)]);
    expect(second.openKeys).toHaveLength(1);
    expect(second.dismissed).toEqual([]);
  });

  it('keeps the tray as it is within a reading', () => {
    const tray = nextTray(start, '1:1:0', 1, [note(-1)]);
    expect(nextTray(tray, '1:1:0', 1, [note(-1), note(-2)])).toBe(tray);
  });

  it('empties the tray when the turn ends', () => {
    const tray = nextTray(start, '1:1:0', 1, [note(-1)]);
    expect(nextTray(tray, '2:0:0', 2, []).openKeys).toEqual([]);
  });
});
