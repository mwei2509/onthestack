import type { SeatView } from '@onthestack/server/protocol';

const COLOURS = ['#8FB8FF', '#F5A97F', '#B9A2FF', '#7FD6C2', '#F2D27A', '#F59AC0'];

/** Seat colours identify players, so they follow join order and never change when seats are reordered. */
export function seatColours(seats: Pick<SeatView, 'id'>[]): Record<string, string> {
  const byJoin = [...seats].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  return Object.fromEntries(byJoin.map((s, i) => [s.id, COLOURS[i % COLOURS.length]!]));
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
