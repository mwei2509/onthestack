import { before, conversation, entry, seatedTable, table, type EvalCase } from '../case.js';

export const basics: EvalCase[] = [
  {
    id: 'land-and-tap-with-seat-ids',
    checks: 'a land played and tapped at a table whose ids are p1, p2, not names (from a real game)',
    turnStart: seatedTable(),
    statements: conversation(['p1', 'i play godless shrine and tap it']),
    currentStep: 'main1',
    expected: {
      entries: [
        entry('main1', 'p1', { type: 'playLand', card: 'Godless Shrine' }, ['s1']),
        entry('main1', 'p1', { type: 'tap', object: { card: 'Godless Shrine' } }, ['s1']),
      ],
    },
  },
  {
    id: 'land-drop',
    checks: 'a plain land drop',
    turnStart: table('theo'),
    statements: conversation(['theo', "I'll play a Plains."]),
    currentStep: 'main1',
    expected: { entries: [entry('main1', 'theo', { type: 'playLand', card: 'Plains' }, ['s1'])] },
  },
  {
    id: 'several-things-in-one-statement',
    checks: 'one statement with a land and a spell, then an attack and no blocks',
    turnStart: table('theo'),
    statements: conversation(['theo', 'Mountain, then Raging Goblin.'], ['theo', 'Goblin attacks Michael.'], ['michael', 'No blocks, I take it.']),
    currentStep: 'main2',
    expected: {
      entries: [
        entry('main1', 'theo', { type: 'playLand', card: 'Mountain' }, ['s1']),
        entry('main1', 'theo', { type: 'cast', card: 'Raging Goblin' }, ['s1']),
        entry('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Raging Goblin' }, target: 'michael' }] }, ['s2']),
        entry('declareBlockers', 'michael', { type: 'noBlock' }, ['s3']),
      ],
    },
  },
  {
    id: 'pay-life',
    checks: 'a stated life payment by a player who is not the active player',
    turnStart: table('theo'),
    statements: conversation(['michael', "I'm paying 4 life."]),
    currentStep: 'main1',
    expected: { entries: [entry('main1', 'michael', { type: 'life', player: 'michael', delta: -4 }, ['s1'])] },
  },
  {
    id: 'shock-a-player',
    checks: 'a burn spell at a player, with the spell as the damage source',
    turnStart: table('theo'),
    statements: conversation(['theo', "Shock to Michael's face."]),
    currentStep: 'main1',
    expected: {
      entries: [
        entry('main1', 'theo', {
          type: 'cast',
          card: 'Shock',
          targets: [{ player: 'michael' }],
          effects: [{ type: 'damage', source: { card: 'Shock' }, recipient: { player: 'michael' }, amount: 2 }],
        }, ['s1']),
      ],
    },
  },
  {
    id: 'murder-a-creature',
    checks: 'removal with its stated effect, naming the controller',
    turnStart: table('theo', [before('melissa', { type: 'cast', card: 'Serra Angel' })]),
    statements: conversation(['theo', "Murder on Melissa's Serra Angel."]),
    currentStep: 'main1',
    expected: {
      entries: [
        entry('main1', 'theo', {
          type: 'cast',
          card: 'Murder',
          targets: [{ card: 'Serra Angel', controller: 'melissa' }],
          effects: [{ type: 'move', object: { card: 'Serra Angel', controller: 'melissa' }, to: 'graveyard', how: 'destroy' }],
        }, ['s1']),
      ],
    },
  },
  {
    id: 'counter-on-a-creature',
    checks: 'a +1/+1 counter',
    turnStart: table('theo', [before('theo', { type: 'cast', card: 'Grizzly Bears' })]),
    statements: conversation(['theo', 'Put a plus one counter on my Bears.']),
    currentStep: 'main1',
    expected: { entries: [entry('main1', 'theo', { type: 'counters', target: { card: 'Grizzly Bears' }, kind: '+1/+1', delta: 1 }, ['s1'])] },
  },
  {
    id: 'pump-spell',
    checks: 'a pump spell as a modify effect until end of turn',
    turnStart: table('theo', [before('theo', { type: 'cast', card: 'Grizzly Bears' })]),
    statements: conversation(['theo', 'Giant Growth on my Bears.']),
    currentStep: 'main1',
    expected: {
      entries: [
        entry('main1', 'theo', {
          type: 'cast',
          card: 'Giant Growth',
          targets: [{ card: 'Grizzly Bears' }],
          effects: [{ type: 'modify', object: { card: 'Grizzly Bears' }, power: 3, toughness: 3, until: 'endOfTurn' }],
        }, ['s1']),
      ],
    },
  },
  {
    id: 'tokens',
    checks: 'creating tokens with the stated size',
    turnStart: table('michael'),
    statements: conversation(['michael', 'I make three one-one Goblin tokens.']),
    currentStep: 'main1',
    expected: {
      entries: [entry('main1', 'michael', { type: 'createToken', token: 'Goblin', count: 3, definition: { types: ['Creature'], power: 1, toughness: 1 } }, ['s1'])],
    },
  },
  {
    id: 'cast-commander',
    checks: 'casting a commander from the command zone',
    turnStart: table('theo'),
    statements: conversation(['theo', 'I cast Teysa from the command zone.']),
    currentStep: 'main1',
    expected: { entries: [entry('main1', 'theo', { type: 'cast', card: 'Teysa Karlov' }, ['s1'])] },
  },
];
