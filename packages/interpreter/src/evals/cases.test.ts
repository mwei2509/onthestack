import { describe, expect, it } from 'vitest';
import { resolveTimeline } from '../resolve.js';
import { InterpretedTimeline, type InterpretedQuestion } from '../schema.js';
import type { EvalCase } from './case.js';
import { CASES } from './cases/index.js';
import { scoreCase } from './score.js';

const perfect = (c: EvalCase): InterpretedTimeline => ({
  entries: c.expected.entries,
  questions: (c.expected.questions ?? []).map((q) => ({ ...q, text: 'asked' })),
});

describe('eval cases', () => {
  it('have unique ids', () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  describe.each(CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    it('has an expected reading that matches the schema', () => {
      expect(InterpretedTimeline.safeParse(perfect(c)).success).toBe(true);
    });

    it('has an expected reading that resolves without questions of its own', () => {
      expect(resolveTimeline(c.turnStart, { entries: c.expected.entries, questions: [] }).questions).toEqual([]);
    });

    it('only cites statements that exist', () => {
      const ids = new Set(c.statements.map((s) => s.id));
      const cited = [...c.expected.entries.flatMap((e) => e.from), ...(c.expected.questions ?? []).flatMap((q) => q.about)];
      expect(cited.filter((s) => !ids.has(s))).toEqual([]);
    });

    it('passes when the model returns exactly the expected reading', () => {
      expect(scoreCase(c, perfect(c))).toMatchObject({ pass: true });
    });
  });
});

describe('scoreCase', () => {
  const byId = (id: string) => CASES.find((c) => c.id === id)!;

  it('passes an equivalent reading in a different order', () => {
    const c = byId('several-things-in-one-statement');
    const [land, cast, ...rest] = c.expected.entries;
    expect(scoreCase(c, { entries: [cast!, land!, ...rest], questions: [] }).pass).toBe(true);
  });

  it('fails a reading that changes the game, and says how', () => {
    const c = byId('take-back-attack-target');
    const wrong = c.expected.entries.map((e) =>
      e.action.type === 'attack' ? { ...e, action: { ...e.action, attacks: [{ attacker: { card: 'Grizzly Bears' }, target: 'michael' }] } } : e,
    );
    const score = scoreCase(c, { entries: wrong, questions: [] });
    expect(score.pass).toBe(false);
    expect(score.outcome.map((o) => o.part)).toContain('players');
  });

  it('fails a reading that ignores a stated damage division', () => {
    const c = byId('stated-damage-division');
    const score = scoreCase(c, { entries: c.expected.entries.filter((e) => e.action.type !== 'divideDamage'), questions: [] });
    expect(score.pass).toBe(false);
  });

  it('fails a guess where a question was expected', () => {
    const c = byId('unclear-card-name');
    const score = scoreCase(c, { entries: [{ step: 'main1', player: 'elena', action: { type: 'cast', card: 'Serra Angel' }, from: ['s1'] }], questions: [] });
    expect(score.pass).toBe(false);
    expect(score.guessed).toEqual(c.expected.questions);
  });

  it('fails a question the conversation already settled', () => {
    const c = byId('land-drop');
    const extra: InterpretedQuestion = { kind: 'yesNo', askPlayer: 'theo', text: 'Did you play a Plains?', about: ['s1'] };
    const score = scoreCase(c, { ...perfect(c), questions: [extra] });
    expect(score.pass).toBe(false);
    expect(score.overAsked).toEqual([extra]);
  });
});
