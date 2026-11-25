import { before, conversation, entry, table, type EvalCase } from '../case.js';

export const corrections: EvalCase[] = [
  {
    id: 'counterspell-in-response',
    checks: 'a Response that counters the spell it answers',
    turnStart: table('theo'),
    statements: conversation(['theo', 'Serra Angel.'], ['melissa', 'In response, Counterspell.']),
    currentStep: 'main1',
    expected: {
      entries: [
        entry('main1', 'theo', { type: 'cast', card: 'Serra Angel' }, ['s1']),
        entry('main1', 'melissa', {
          type: 'cast',
          card: 'Counterspell',
          targets: [{ card: 'Serra Angel' }],
          effects: [{ type: 'counter', spell: { card: 'Serra Angel' } }],
        }, ['s2'], true),
      ],
    },
  },
  {
    id: 'skips-ahead-from-upkeep',
    checks: "a land and a creature said in upkeep go in main1 without asking which Step (ADR 0066, from a real game)",
    turnStart: table('theo'),
    statements: conversation(['theo', 'I play a Plains and Serra Angel.']),
    currentStep: 'upkeep',
    expected: {
      entries: [
        entry('main1', 'theo', { type: 'playLand', card: 'Plains' }, ['s1']),
        entry('main1', 'theo', { type: 'cast', card: 'Serra Angel' }, ['s1']),
      ],
    },
  },
  {
    id: 'late-land-drop',
    checks: 'a statement placed back in an earlier Step',
    turnStart: table('theo', [before('theo', { type: 'cast', card: 'Grizzly Bears' })]),
    statements: conversation(['theo', 'Bears attack Elena.'], ['elena', 'No blocks.'], ['theo', 'Oh wait, back in main one I played a Forest.']),
    currentStep: 'main2',
    expected: {
      entries: [
        entry('main1', 'theo', { type: 'playLand', card: 'Forest' }, ['s3']),
        entry('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Grizzly Bears' }, target: 'elena' }] }, ['s1']),
        entry('declareBlockers', 'elena', { type: 'noBlock' }, ['s2']),
      ],
    },
  },
  {
    id: 'take-back-attack-target',
    checks: 'a take-back that changes what an earlier statement said',
    turnStart: table('theo', [before('theo', { type: 'cast', card: 'Grizzly Bears' })]),
    statements: conversation(['theo', 'Bears attack Michael.'], ['theo', 'Oops, I mean Melissa.'], ['melissa', 'No blocks.']),
    currentStep: 'main2',
    expected: {
      entries: [
        entry('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Grizzly Bears' }, target: 'melissa' }] }, ['s1', 's2']),
        entry('declareBlockers', 'melissa', { type: 'noBlock' }, ['s3']),
      ],
    },
  },
  {
    id: 'never-mind',
    checks: 'a take-back that removes everything said',
    turnStart: table('theo', [before('michael', { type: 'cast', card: 'Grizzly Bears' })]),
    statements: conversation(['theo', "I'll Murder Michael's Bears."], ['theo', "Actually never mind, I'm not casting that."]),
    currentStep: 'main1',
    expected: { entries: [] },
  },
];
