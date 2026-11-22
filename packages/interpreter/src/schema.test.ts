import { describe, expect, it } from 'vitest';
import { InterpretedTimeline, interpretedTimelineJsonSchema } from './schema.js';

const valid = {
  entries: [
    { step: 'main1', player: 'theo', action: { type: 'playLand', card: 'Plains' }, from: ['s1'] },
    {
      step: 'main1',
      player: 'theo',
      action: {
        type: 'cast',
        card: 'Murder',
        targets: [{ card: 'Serra Angel', controller: 'melissa' }],
        effects: [{ type: 'move', object: { card: 'Serra Angel', controller: 'melissa' }, to: 'graveyard', how: 'destroy' }],
      },
      from: ['s2'],
    },
    {
      step: 'declareAttackers',
      player: 'theo',
      action: { type: 'attack', attacks: [{ attacker: { card: 'Hinterland Sanctifier' }, target: 'melissa' }] },
      from: ['s3'],
    },
    {
      step: 'combatDamage',
      player: 'theo',
      action: { type: 'divideDamage', attacker: { card: 'Craterhoof Behemoth' }, split: [{ to: { card: 'Wall of Omens' }, amount: 4 }, { to: { player: 'melissa' }, amount: 6 }] },
      from: ['s4'],
    },
  ],
  questions: [
    { kind: 'chooseOption', askPlayer: 'elena', text: 'Did you say Serra Angel or Savannah Lions?', about: ['s5'], options: ['Serra Angel', 'Savannah Lions'] },
  ],
};

describe('InterpretedTimeline', () => {
  it('accepts a timeline with nested spell effects and a question', () => {
    expect(InterpretedTimeline.parse(valid)).toEqual(valid);
  });

  it('rejects an unknown GameAction', () => {
    const bad = { ...valid, entries: [{ ...valid.entries[0], action: { type: 'shuffle' } }] };
    expect(InterpretedTimeline.safeParse(bad).success).toBe(false);
  });

  it('rejects a Step the engine does not know', () => {
    const bad = { ...valid, entries: [{ ...valid.entries[0], step: 'secondMain' }] };
    expect(InterpretedTimeline.safeParse(bad).success).toBe(false);
  });

  it('rejects an entry with no source statement', () => {
    const bad = { ...valid, entries: [{ ...valid.entries[0], from: [] }] };
    expect(InterpretedTimeline.safeParse(bad).success).toBe(false);
  });

  it('rejects a question kind outside the typed list', () => {
    const bad = { ...valid, questions: [{ ...valid.questions[0], kind: 'suggestPlay' }] };
    expect(InterpretedTimeline.safeParse(bad).success).toBe(false);
  });
});

describe('interpretedTimelineJsonSchema', () => {
  const schema = interpretedTimelineJsonSchema();
  const text = JSON.stringify(schema);

  it('describes the top-level shape', () => {
    expect(schema).toMatchObject({ type: 'object', required: ['entries', 'questions'] });
  });

  it('carries the field descriptions the model reads', () => {
    expect(text).toContain('never lists legal plays');
  });

  it('uses no free-form maps, which strict structured output rejects', () => {
    expect(text).not.toMatch(/"additionalProperties":\{/);
  });
});
