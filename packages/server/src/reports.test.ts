import { describe, expect, it } from 'vitest';
import { fitDump } from './reports.js';

const interpretation = (n: number) => ({ transcriptVersion: n, user: 'u'.repeat(300), answer: 'a'.repeat(300) });

describe('fitDump', () => {
  it('keeps a dump that fits as it is', () => {
    const dump = { code: 'X', interpretations: [interpretation(1)] };
    expect(fitDump(dump, 10_000)).toEqual({ json: JSON.stringify(dump), trimmed: false });
  });

  it("trims the oldest interpretations' prompts first, then answers, keeping the rest", () => {
    const dump = { code: 'X', turns: ['kept'], interpretations: [interpretation(1), interpretation(2), interpretation(3)] };
    const { json, trimmed } = fitDump(dump, 1_500);
    const fitted = JSON.parse(json) as typeof dump;
    expect(trimmed).toBe(true);
    expect(fitted.turns).toEqual(['kept']);
    expect(fitted.interpretations[0]!.user).toBe('(trimmed to fit the report)');
    expect(fitted.interpretations[2]!.answer).toBe('a'.repeat(300));
    expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(1_500);
  });
});
