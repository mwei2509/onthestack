import type { ReadbackNote } from '@onthestack/engine';
import type { TurnLog } from '@onthestack/server/protocol';
import { useState } from 'react';
import { netLife, newNoteKeys, noteKeys } from './notes.js';

export interface TrayState {
  /** Which reading the tray is for: the turn, the statements read and the taps. */
  reading: string;
  turn: number;
  notes: ReadbackNote[];
  openKeys: string[];
  dismissed: string[];
}

/** The tray after an update: unchanged within a reading; on a new one, the notes new since the last, undismissed. */
export function nextTray(tray: TrayState, reading: string, turn: number, notes: ReadbackNote[]): TrayState {
  if (tray.reading === reading) return tray;
  return { reading, turn, notes, openKeys: tray.turn === turn ? newNoteKeys(tray.notes, notes) : [], dismissed: [] };
}

export interface NoteTray {
  /** Open notes, oldest first. */
  open: ReadbackNote[];
  dismiss: (note: ReadbackNote) => void;
  /** Each player's net life change across the open notes (ADR 0136). */
  net: Record<string, number>;
}

/**
 * This device's readback tray (ADR 0136): the notes that are new or changed since the previous reading. They leave when
 * the next reading lands, when the turn ends, or when dismissed here; nothing is sent or remembered elsewhere. A device
 * that joins mid-turn starts with an empty tray.
 */
export function useNoteTray(log: TurnLog | null, turn: number): NoteTray {
  const notes = log?.readbackNotes ?? [];
  const reading = `${turn}:${log?.statements.filter((s) => s.status === 'read').length ?? 0}:${log?.entries.filter((e) => e.from.length === 0).length ?? 0}`;
  const [tray, setTray] = useState<TrayState>({ reading, turn, notes, openKeys: [], dismissed: [] });

  const current = nextTray(tray, reading, turn, notes);
  if (current !== tray) setTray(current);

  const keys = noteKeys(notes);
  const open = notes.filter((_, i) => current.openKeys.includes(keys[i]!) && !current.dismissed.includes(keys[i]!));
  return {
    open,
    net: netLife(open),
    dismiss: (note) => {
      const key = keys[notes.indexOf(note)];
      if (key) setTray((t) => ({ ...t, dismissed: [...t.dismissed, key] }));
    },
  };
}
