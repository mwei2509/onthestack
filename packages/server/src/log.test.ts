import { createGame, replayTurn } from '@onthestack/engine';
import { resolveTimeline } from '@onthestack/interpreter';
import { describe, expect, it } from 'vitest';
import { replaySummary } from './log.js';

describe('replaySummary', () => {
  it('shows the battlefield, the Stack, life and what resolving asked, so a vanished card stands out', () => {
    const start = createGame([
      { id: 'p1', name: 'mel' },
      { id: 'p2', name: 'test' },
    ]);
    const resolved = resolveTimeline(start, {
      entries: [
        { step: 'main1', player: 'p1', action: { type: 'playLand', card: 'Plains' }, from: ['s1'] },
        { step: 'main1', player: 'p1', action: { type: 'tap', object: { card: 'Plains' } }, from: ['s1'] },
        { step: 'main1', player: 'p1', action: { type: 'cast', card: 'Hinterland Sanctifier' }, from: ['s1'] },
        { step: 'main1', player: 'p1', action: { type: 'life', player: 'p2', delta: -3 }, from: ['s2'] },
        { step: 'main1', player: 'p1', action: { type: 'tap', object: { card: 'Island' } }, from: ['s3'] },
      ],
      questions: [],
    });
    const summary = replaySummary(resolved, replayTurn(start, resolved.timeline, { currentStep: 'main1' }));
    expect(summary.battlefield).toEqual(['Plains (p1, tapped)']);
    expect(summary.life).toEqual({ p1: 40, p2: 37 });
    expect(summary.questions).toEqual([expect.stringContaining('chooseObjects to p1')]);
    expect(summary.warnings).toContainEqual(expect.stringContaining('unknownCard'));
    expect(summary.entries).toBe(4);
  });
});
