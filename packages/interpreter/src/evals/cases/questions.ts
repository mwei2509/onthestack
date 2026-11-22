import { before, conversation, entry, table, type EvalCase } from '../case.js';

export const questions: EvalCase[] = [
  {
    id: 'unclear-card-name',
    checks: 'a name that could be two cards in the game is asked about, not guessed (ADR 0043)',
    turnStart: table('elena'),
    statements: conversation(['elena', 'I cast Savanna Angel.']),
    currentStep: 'main1',
    expected: { entries: [], questions: [{ kind: 'chooseOption', askPlayer: 'elena', about: ['s1'] }] },
  },
  {
    id: 'which-zombie',
    checks: 'two different Zombies and no way to tell which attacked (ADR 0043, 0045)',
    turnStart: table('theo', [
      before('theo', { type: 'createToken', token: 'Zombie', count: 2, definition: { types: ['Creature'], power: 2, toughness: 2 } }),
      before('theo', { type: 'counters', target: { card: 'Zombie' }, kind: '+1/+1', delta: 1 }),
    ]),
    statements: conversation(['theo', 'My Zombie attacks Michael.']),
    currentStep: 'declareAttackers',
    expected: { entries: [], questions: [{ kind: 'chooseObjects', askPlayer: 'theo', about: ['s1'] }] },
  },
  {
    id: 'when-was-the-shock',
    checks: 'a late statement whose timing changes the outcome is asked about (ADR 0043)',
    turnStart: table('theo', [before('theo', { type: 'cast', card: 'Fencing Ace' }), before('melissa', { type: 'cast', card: 'Wall of Omens' })]),
    statements: conversation(
      ['theo', 'Fencing Ace attacks Melissa.'],
      ['melissa', 'Wall of Omens blocks.'],
      ['theo', 'Okay, combat is over.'],
      ['melissa', 'Oh, I Shocked the Ace at some point during combat.'],
    ),
    currentStep: 'main2',
    expected: {
      entries: [
        entry('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Fencing Ace' }, target: 'melissa' }] }, ['s1']),
        entry('declareBlockers', 'melissa', { type: 'block', blocks: [{ blocker: { card: 'Wall of Omens' }, attacker: { card: 'Fencing Ace' } }] }, ['s2']),
      ],
      questions: [{ kind: 'whichStep', askPlayer: 'melissa', about: ['s4'] }],
    },
  },
  {
    id: 'no-question-when-clear',
    checks: 'a slightly misspoken name with only one match is read, not asked about',
    turnStart: table('theo'),
    statements: conversation(['theo', 'I cast Sarah Angel.']),
    currentStep: 'main1',
    expected: { entries: [entry('main1', 'theo', { type: 'cast', card: 'Serra Angel' }, ['s1'])] },
  },
];
