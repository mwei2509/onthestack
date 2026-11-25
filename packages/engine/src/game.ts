import type { CardDefinition } from './cards.js';
import type { CardName, PlayerId } from './ids.js';
import type { GameState, Player } from './state.js';

export const STARTING_LIFE = 40;

export interface Seat {
  id: PlayerId;
  name: string;
  commander?: CardName;
  /** From the seat's Deck, so partner commanders count (ADR 0120). */
  colorIdentity?: string[];
}

export function createGame(seats: Seat[], cards: Record<CardName, CardDefinition> = {}): GameState {
  const first = seats[0];
  if (!first) {
    throw new Error('A game needs at least one player');
  }
  if (new Set(seats.map((s) => s.id)).size !== seats.length) {
    throw new Error('Player ids must be unique');
  }

  const players: Record<PlayerId, Player> = {};
  for (const s of seats) {
    players[s.id] = {
      id: s.id,
      name: s.name,
      life: STARTING_LIFE,
      poison: 0,
      commanderDamage: {},
      out: false,
      ...(s.colorIdentity ? { colorIdentity: s.colorIdentity } : {}),
    };
  }

  return {
    turn: { number: 1, activePlayerId: first.id, step: 'untap' },
    turnOrder: seats.map((s) => s.id),
    players,
    cards,
    permanents: {},
    graveyards: Object.fromEntries(seats.map((s) => [s.id, []])),
    exile: [],
    commandZone: Object.fromEntries(seats.map((s) => [s.id, s.commander ? { card: s.commander, casts: 0, inZone: true } : null])),
    stack: [],
    combat: null,
    delayedTriggers: [],
    pendingTriggers: [],
    gameEventsThisTurn: [],
    nextIds: { permanent: 1, gameEvent: 1, stackItem: 1 },
  };
}
