import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { createGame, STARTING_LIFE } from './game.js';

const seating = fc.uniqueArray(
  fc.record({ id: fc.string({ minLength: 1 }), name: fc.string() }),
  { minLength: 1, maxLength: 8, selector: (p) => p.id },
);

describe('createGame', () => {
  test.prop([seating])('every player starts at 40 life with no commander damage', (players) => {
    const game = createGame(players);
    for (const player of game.players) {
      expect(player.life).toBe(STARTING_LIFE);
      expect(player.commanderDamage).toEqual({});
    }
  });

  test.prop([seating])('keeps the seating order and starts on the first seat, turn 1', (players) => {
    const game = createGame(players);
    expect(game.players.map((p) => p.id)).toEqual(players.map((p) => p.id));
    expect(game.turn).toEqual({ number: 1, activePlayerId: players[0]!.id });
  });

  test.prop([seating])('is deterministic', (players) => {
    expect(createGame(players)).toEqual(createGame(players));
  });

  test('rejects an empty table and duplicate ids', () => {
    expect(() => createGame([])).toThrow();
    expect(() => createGame([{ id: 'a', name: 'Theo' }, { id: 'a', name: 'Elena' }])).toThrow();
  });
});
