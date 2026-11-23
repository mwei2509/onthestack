import { before, conversation, entry, table, type EvalCase } from '../case.js';

export const combat: EvalCase[] = [
  {
    id: 'block-and-trade',
    checks: 'an attack, a block, and damage running on its own',
    turnStart: table('theo', [before('theo', { type: 'cast', card: 'Serra Angel' }), before('michael', { type: 'cast', card: 'Grizzly Bears' })]),
    statements: conversation(['theo', 'Serra Angel attacks Michael.'], ['michael', "I'll block with my Bears."]),
    currentStep: 'main2',
    expected: {
      entries: [
        entry('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Serra Angel' }, target: 'michael' }] }, ['s1']),
        entry('declareBlockers', 'michael', { type: 'block', blocks: [{ blocker: { card: 'Grizzly Bears' }, attacker: { card: 'Serra Angel' } }] }, ['s2']),
      ],
    },
  },
  {
    id: 'two-attackers-two-defenders',
    checks: 'attacks at two players, each answering',
    turnStart: table('theo', [before('theo', { type: 'cast', card: 'Grizzly Bears' }), before('theo', { type: 'cast', card: 'Savannah Lions' })]),
    statements: conversation(['theo', 'Bears attack Michael, the Lions go at Elena.'], ['michael', 'No blocks.'], ['elena', "I'll take it."]),
    currentStep: 'main2',
    expected: {
      entries: [
        entry('declareAttackers', 'theo', {
          type: 'attack',
          attacks: [
            { attacker: { card: 'Grizzly Bears' }, target: 'michael' },
            { attacker: { card: 'Savannah Lions' }, target: 'elena' },
          ],
        }, ['s1']),
        entry('declareBlockers', 'michael', { type: 'noBlock' }, ['s2']),
        entry('declareBlockers', 'elena', { type: 'noBlock' }, ['s3']),
      ],
    },
  },
  {
    id: 'stated-damage-division',
    checks: 'a trampler whose controller puts all its damage on the blocker instead of the default split',
    turnStart: table('theo', [before('theo', { type: 'cast', card: 'Craterhoof Behemoth' }), before('melissa', { type: 'cast', card: 'Wall of Omens' })]),
    statements: conversation(['theo', 'Craterhoof attacks Melissa.'], ['melissa', 'Wall of Omens blocks.'], ['theo', 'All five to the Wall.']),
    currentStep: 'main2',
    expected: {
      entries: [
        entry('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Craterhoof Behemoth' }, target: 'melissa' }] }, ['s1']),
        entry('declareBlockers', 'melissa', { type: 'block', blocks: [{ blocker: { card: 'Wall of Omens' }, attacker: { card: 'Craterhoof Behemoth' } }] }, ['s2']),
        entry('declareBlockers', 'theo', { type: 'divideDamage', attacker: { card: 'Craterhoof Behemoth' }, split: [{ to: { card: 'Wall of Omens' }, amount: 5 }] }, ['s3']),
      ],
    },
  },
  {
    id: 'shock-after-first-strike',
    checks: 'the engine-model example: a Response anchored after first-strike damage',
    turnStart: table('theo', [before('theo', { type: 'cast', card: 'Fencing Ace' }), before('melissa', { type: 'cast', card: 'Wall of Omens' })]),
    statements: conversation(
      ['theo', "Fencing Ace attacks you, Melissa, it's got double strike."],
      ['melissa', 'Okay, Wall of Omens blocks it.'],
      ['melissa', 'Oh, after its first strike I Shock it.'],
    ),
    currentStep: 'main2',
    expected: {
      entries: [
        entry('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Fencing Ace' }, target: 'melissa' }] }, ['s1']),
        entry('declareBlockers', 'melissa', { type: 'block', blocks: [{ blocker: { card: 'Wall of Omens' }, attacker: { card: 'Fencing Ace' } }] }, ['s2']),
        entry('firstStrikeDamage', 'melissa', {
          type: 'cast',
          card: 'Shock',
          targets: [{ card: 'Fencing Ace' }],
          effects: [{ type: 'damage', source: { card: 'Shock' }, recipient: { card: 'Fencing Ace' }, amount: 2 }],
        }, ['s3']),
      ],
    },
  },
  {
    id: 'controller-settles-which-bears',
    checks: "two players' Bears, settled by who is attacking, without a question",
    turnStart: table('theo', [before('theo', { type: 'cast', card: 'Grizzly Bears' }), before('michael', { type: 'cast', card: 'Grizzly Bears' })]),
    statements: conversation(['theo', 'Bears attack Elena.'], ['elena', 'No blocks.']),
    currentStep: 'main2',
    expected: {
      entries: [
        entry('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Grizzly Bears', controller: 'theo' }, target: 'elena' }] }, ['s1']),
        entry('declareBlockers', 'elena', { type: 'noBlock' }, ['s2']),
      ],
    },
  },
];
