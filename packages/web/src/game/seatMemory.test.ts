import { describe, expect, it } from 'vitest';
import { afterClaimRefused, afterUpdate, onOpen, sameMemory } from './seatMemory.js';

const update = (you: string | null) => ({ type: 'update' as const, version: 2, you, seats: [], started: false, ended: null, joinCode: null, view: null });

describe('seat memory', () => {
  it('reclaims a remembered seat on connect, without taking it over', () => {
    expect(onOpen({ seatId: 'p2' })).toEqual({ type: 'claim', seatId: 'p2' });
    expect(onOpen('watching')).toEqual({ type: 'watch' });
    expect(onOpen(null)).toBeNull();
  });

  it('remembers the seat the server says this device holds', () => {
    expect(afterUpdate(null, update('p3'), null)).toEqual({ seatId: 'p3' });
  });

  it('keeps the memory through the first update of a new socket, before the claim is answered', () => {
    expect(afterUpdate({ seatId: 'p3' }, update(null), null)).toEqual({ seatId: 'p3' });
  });

  it('forgets a seat that moved to another device or was removed', () => {
    expect(afterUpdate({ seatId: 'p3' }, update(null), 'p3')).toBeNull();
    expect(afterClaimRefused({ seatId: 'p3' })).toBeNull();
  });

  it('stays a Shared screen', () => {
    expect(afterUpdate('watching', update(null), null)).toBe('watching');
    expect(afterClaimRefused('watching')).toBe('watching');
  });

  it('compares memories by seat, so an unchanged seat is not written again', () => {
    expect(sameMemory({ seatId: 'p1' }, { seatId: 'p1' })).toBe(true);
    expect(sameMemory({ seatId: 'p1' }, { seatId: 'p2' })).toBe(false);
    expect(sameMemory('watching', 'watching')).toBe(true);
    expect(sameMemory(null, 'watching')).toBe(false);
  });
});
