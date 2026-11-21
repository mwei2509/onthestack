export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  life: number;
  commanderDamage: Record<string, number>;
}

export interface GameState {
  players: Player[];
  turn: {
    number: number;
    activePlayerId: PlayerId;
  };
}

export interface NewPlayer {
  id: PlayerId;
  name: string;
}

export const STARTING_LIFE = 40;

export function createGame(seating: NewPlayer[]): GameState {
  const first = seating[0];
  if (!first) {
    throw new Error('A game needs at least one player');
  }
  if (new Set(seating.map((p) => p.id)).size !== seating.length) {
    throw new Error('Player ids must be unique');
  }

  return {
    players: seating.map((p) => ({
      id: p.id,
      name: p.name,
      life: STARTING_LIFE,
      commanderDamage: {},
    })),
    turn: { number: 1, activePlayerId: first.id },
  };
}
