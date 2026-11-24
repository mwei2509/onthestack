import type { Player, TableView } from '@onthestack/engine';
import type { SeatView } from '@onthestack/server/protocol';
import { seatColours } from '../seats.js';

/** A commander-damage status cue: 15 or more from one commander is shown in the warning colour (ADR 0056). */
export const CUE_AT = 15;

export interface CommanderHit {
  fromId: string;
  commander: string;
  damage: number;
}

export interface BoardPlayer extends Player {
  colour: string;
  connected: boolean;
  commander: string | null;
  active: boolean;
  /** Combat damage taken from each other player's commander, including 0 for commanders that haven't hit yet. */
  hits: CommanderHit[];
}

/** The TableView's players in turn order, with what the board shows for each: colour, device, commander damage. */
export function boardPlayers(view: TableView, seats: SeatView[]): BoardPlayer[] {
  const colours = seatColours(seats);
  const connected = new Set(seats.filter((s) => s.connected).map((s) => s.id));
  const commanders = Object.entries(view.commandZone).flatMap(([id, c]) => (c ? [{ id, card: c.card }] : []));
  return Object.values(view.players).map((p) => ({
    ...p,
    colour: colours[p.id] ?? '#A3A9B3',
    connected: connected.has(p.id),
    commander: view.commandZone[p.id]?.card ?? null,
    active: p.id === view.turn.activePlayerId,
    hits: commanders.filter((c) => c.id !== p.id).map((c) => ({ fromId: c.id, commander: c.card, damage: p.commanderDamage[c.card] ?? 0 })),
  }));
}
