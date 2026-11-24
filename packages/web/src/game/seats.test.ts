import { describe, expect, it } from 'vitest';
import { clockwiseFrom, deckLine, initial, moved, seatColours, seatLooks } from './seats.js';

describe('seats', () => {
  it('keeps each seat\'s colour when the seats are reordered', () => {
    const before = seatColours([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
    const after = seatColours([{ id: 'p3' }, { id: 'p1' }, { id: 'p2' }]);
    expect(after).toEqual(before);
    expect(new Set(Object.values(before)).size).toBe(3);
  });

  it('orders turns clockwise from the winner', () => {
    const seats = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(clockwiseFrom(seats, 'b').map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('moves a seat to a new position', () => {
    expect(moved(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moved(['a', 'b'], 'a', 9)).toEqual(['b', 'a']);
  });

  it('takes the first letter for the avatar', () => {
    expect(initial(' ana')).toBe('A');
    expect(initial('')).toBe('?');
  });
});

describe('seatLooks', () => {
  it("draws a seat in its Deck's colour identity, or its seat colour without one (ADR 0086)", () => {
    const deck = (colorIdentity: string[]) => ({ id: 'd', name: 'D', commanders: [], colorIdentity });
    const looks = seatLooks([
      { id: 'p1', deck: deck(['W', 'B']) },
      { id: 'p2', deck: deck([]) },
      { id: 'p3' },
    ]);
    expect(looks.p1!.identity).toEqual(['W', 'B']);
    expect(looks.p1!.ring).toMatch(/^conic-gradient/);
    expect(looks.p2!.ring).toBe(looks.p2!.colour);
    expect(looks.p3!.ring).toBe(looks.p3!.colour);
  });
});

describe('deckLine', () => {
  it("names a seat's Deck and its commanders", () => {
    expect(deckLine({ name: 'Vampires', commanders: ['Vona, Butcher of Magan'] })).toBe('Vampires · Vona, Butcher of Magan');
    expect(deckLine({ name: 'Rings', commanders: [] })).toBe('Rings · no commander');
  });
});
