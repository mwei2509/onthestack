import type { RulesWarning } from '@onthestack/engine';
import { describe, expect, it } from 'vitest';
import { openWarnings, placeWarnings } from './warnings.js';

const warning = (code: RulesWarning['code'], from?: string[], overriddenBy?: string): RulesWarning => ({
  code,
  message: code,
  ...(from ? { entry: { step: 'main1', playerId: 'p1', from } } : {}),
  ...(overriddenBy ? { overriddenBy } : {}),
});

describe('placeWarnings (ADR 0122)', () => {
  it('puts a warning under the last statement its entry came from', () => {
    const w = warning('summoningSickness', ['s3', 's1']);
    expect(placeWarnings([w], ['s1', 's2', 's3']).byStatement.get('s3')).toEqual([w]);
  });

  it('puts warnings no statement raised at the top', () => {
    const loop = warning('possibleLoop');
    const tap = warning('unknownPlayer', []);
    const gone = warning('tapped', ['s9']);
    const placed = placeWarnings([loop, tap, gone], ['s1']);
    expect(placed.top).toEqual([loop, tap, gone]);
    expect(placed.byStatement.size).toBe(0);
  });
});

describe('openWarnings', () => {
  it('leaves out warnings someone did anyway', () => {
    expect(openWarnings([warning('tapped', ['s1'], 'p2'), warning('menace', ['s1'])]).map((w) => w.code)).toEqual(['menace']);
  });
});
