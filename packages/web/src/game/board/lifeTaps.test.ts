import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTapCombiner } from './lifeTaps.js';

describe('life taps', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends quick taps as one change once the player pauses', () => {
    const sent: number[] = [];
    const pending: number[] = [];
    const taps = createTapCombiner((d) => sent.push(d), (d) => pending.push(d));
    taps.tap(-1);
    vi.advanceTimersByTime(1000);
    taps.tap(-1);
    vi.advanceTimersByTime(1000);
    taps.tap(-1);
    expect(sent).toEqual([]);
    expect(pending.at(-1)).toBe(-3);
    vi.advanceTimersByTime(1500);
    expect(sent).toEqual([-3]);
    expect(pending.at(-1)).toBe(0);
  });

  it('sends nothing when the taps cancel out', () => {
    const sent: number[] = [];
    const taps = createTapCombiner((d) => sent.push(d), () => undefined);
    taps.tap(1);
    taps.tap(-1);
    vi.advanceTimersByTime(2000);
    expect(sent).toEqual([]);
  });

  it('keeps separate pauses separate', () => {
    const sent: number[] = [];
    const taps = createTapCombiner((d) => sent.push(d), () => undefined);
    taps.tap(-2);
    vi.advanceTimersByTime(1600);
    taps.tap(1);
    vi.advanceTimersByTime(1600);
    expect(sent).toEqual([-2, 1]);
  });
});
