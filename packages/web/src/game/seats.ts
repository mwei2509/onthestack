import type { SeatView } from '@onthestack/server/protocol';
import { identityRing } from '../decks/identity.js';

const COLOURS = ['#8FB8FF', '#F5A97F', '#B9A2FF', '#7FD6C2', '#F2D27A', '#F59AC0'];

/** Seat colours identify players, so they follow join order and never change when seats are reordered. */
export function seatColours(seats: Pick<SeatView, 'id'>[]): Record<string, string> {
  const byJoin = [...seats].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  return Object.fromEntries(byJoin.map((s, i) => [s.id, COLOURS[i % COLOURS.length]!]));
}

/** How a seat is drawn: its Deck's colour identity once it has one, else its seat colour (ADR 0081, 0086). */
export interface SeatLook {
  colour: string;
  identity: string[];
  /** For a coin's ring: the identity's colours, or the seat colour. */
  ring: string;
}

export function seatLooks(seats: Pick<SeatView, 'id' | 'deck'>[]): Record<string, SeatLook> {
  const colours = seatColours(seats);
  return Object.fromEntries(
    seats.map((s) => {
      const identity = s.deck?.colorIdentity ?? [];
      const colour = colours[s.id]!;
      return [s.id, { colour, identity, ring: identity.length > 0 ? identityRing(identity) : colour }];
    }),
  );
}

/** A seat's Deck in one line: "Vampires · Vona, Butcher of Magan". */
export function deckLine(deck: Pick<NonNullable<SeatView['deck']>, 'name' | 'commanders'>): string {
  return `${deck.name} · ${deck.commanders.length > 0 ? deck.commanders.join(' & ') : 'no commander'}`;
}

export const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '?';

/** Turns go clockwise from whoever won the dice. */
export function clockwiseFrom<T extends { id: string }>(seats: T[], firstId: string): T[] {
  const i = Math.max(0, seats.findIndex((s) => s.id === firstId));
  return [...seats.slice(i), ...seats.slice(0, i)];
}

/** The seat order after moving one seat to a new position. */
export function moved(ids: string[], id: string, to: number): string[] {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, id);
  return rest;
}
