import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { createGame, STARTING_LIFE } from './game.js';

const seats = fc.uniqueArray(
  fc.record({ id: fc.string({ minLength: 1 }), name: fc.string(), commander: fc.option(fc.string({ minLength: 1 }), { nil: undefined }) }),
  { minLength: 1, maxLength: 8, selector: (s) => s.id },
);

describe('createGame', () => {
  test.prop([seats])('every player starts at 40 life, no poison, no commander damage, still in', (s) => {
    const game = createGame(s);
    for (const seat of s) {
      expect(game.players[seat.id]).toMatchObject({ life: STARTING_LIFE, poison: 0, commanderDamage: {}, out: false });
    }
  });

  test.prop([seats])('keeps the seating as turn order and starts at the untap step of turn 1', (s) => {
    const game = createGame(s);
    expect(game.turnOrder).toEqual(s.map((x) => x.id));
    expect(game.turn).toEqual({ number: 1, activePlayerId: s[0]!.id, step: 'untap' });
  });

  test.prop([seats])('puts each commander in its owner’s command zone and every zone starts empty', (s) => {
    const game = createGame(s);
    for (const seat of s) {
      expect(game.commandZone[seat.id]).toEqual(seat.commander ? { card: seat.commander, casts: 0 } : null);
      expect(game.graveyards[seat.id]).toEqual([]);
    }
    expect(game.permanents).toEqual({});
    expect(game.stack).toEqual([]);
    expect(game.exile).toEqual([]);
    expect(game.combat).toBeNull();
  });

  test.prop([seats])('is deterministic', (s) => {
    expect(createGame(s)).toEqual(createGame(s));
  });

  test('rejects an empty table and duplicate ids', () => {
    expect(() => createGame([])).toThrow();
    expect(() => createGame([{ id: 'a', name: 'Theo' }, { id: 'a', name: 'Elena' }])).toThrow();
  });
});
