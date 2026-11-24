import type { Player, TableView } from '@onthestack/engine';
import type { SeatView } from '@onthestack/server/protocol';
import { seatLooks } from '../seats.js';

/** A commander-damage status cue: 15 or more from one commander is shown in the warning colour (ADR 0056). */
export const CUE_AT = 15;

export interface CommanderHit {
  fromId: string;
  commander: string;
  damage: number;
}

export interface BoardPlayer extends Player {
  colour: string;
  /** The coin's ring and the glow's colours: the Deck's colour identity at Start, else the seat colour (ADR 0086). */
  ring: string;
  identity: string[];
  connected: boolean;
  commander: string | null;
  active: boolean;
  /** Combat damage taken from each other player's commander, including 0 for commanders that haven't hit yet. */
  hits: CommanderHit[];
}

/** The TableView's players in turn order, with what the board shows for each: colour, device, commander damage. */
export function boardPlayers(view: TableView, seats: SeatView[]): BoardPlayer[] {
  const looks = seatLooks(seats);
  const connected = new Set(seats.filter((s) => s.connected).map((s) => s.id));
  const commanders = Object.entries(view.commandZone).flatMap(([id, c]) => (c ? [{ id, card: c.card }] : []));
  return Object.values(view.players).map((p) => ({
    ...p,
    colour: looks[p.id]?.colour ?? '#A3A9B3',
    ring: looks[p.id]?.ring ?? '#A3A9B3',
    identity: looks[p.id]?.identity ?? [],
    connected: connected.has(p.id),
    commander: view.commandZone[p.id]?.card ?? null,
    active: p.id === view.turn.activePlayerId,
    hits: commanders.filter((c) => c.id !== p.id).map((c) => ({ fromId: c.id, commander: c.card, damage: p.commanderDamage[c.card] ?? 0 })),
  }));
}
