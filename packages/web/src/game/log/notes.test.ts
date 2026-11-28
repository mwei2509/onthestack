import type { ReadbackNote } from '@onthestack/engine';
import { describe, expect, it } from 'vitest';
import type { Names } from './describe.js';
import { describeNote, placeNotes } from './notes.js';

const names: Names = { player: (id) => ({ m: 'melissa', t: 'tester', a: 'Ana', p: 'Priya' })[id] ?? id, object: () => 'a card that left' };

describe('describeNote (ADR 0134)', () => {
  it('reads the one-attacker combat note with lifelink on the same line', () => {
    const note: ReadbackNote = {
      cause: { combatDamage: 'combatDamage' },
      entry: { playerStatement: 's1' },
      effects: [
        { type: 'damage', source: { objectId: 'p1', card: 'Elenda' }, to: { playerId: 't' }, amount: 1 },
        { type: 'life', playerId: 't', delta: -1, reason: 'damage' },
        { type: 'life', playerId: 'm', delta: 1, reason: 'gain', lifelink: true },
      ],
    };
    expect(describeNote(note, names)).toEqual(['Elenda dealt 1 to tester · lifelink: melissa gains 1']);
  });

  it('gives each attacker a line, then lifelink, then deaths', () => {
    const note: ReadbackNote = {
      cause: { combatDamage: 'combatDamage' },
      entry: { playerStatement: 's1' },
      effects: [
        { type: 'damage', source: { objectId: 'p1', card: 'Elenda' }, to: { playerId: 't' }, amount: 1 },
        { type: 'damage', source: { objectId: 'p2', card: 'Grizzly Bears' }, to: { objectId: 'p3', card: 'Llanowar Elves' }, amount: 2 },
        { type: 'life', playerId: 'm', delta: 1, reason: 'gain', lifelink: true },
        { type: 'moved', card: 'Llanowar Elves', ownerId: 't', from: 'battlefield', to: 'graveyard', how: 'stateBased' },
      ],
    };
    expect(describeNote(note, names)).toEqual(['Elenda dealt 1 to tester', 'Grizzly Bears dealt 2 to Llanowar Elves', 'Lifelink: melissa gains 1', 'Dies: Llanowar Elves']);
  });

  it('reads a trigger as its card and controller, then what it did', () => {
    const note: ReadbackNote = {
      cause: { stackItem: 'k2', kind: 'trigger', card: 'Blood Artist', controllerId: 'p', status: 'resolved' },
      entry: { playerStatement: 's1' },
      effects: [
        { type: 'life', playerId: 'a', delta: -1, reason: 'loss' },
        { type: 'life', playerId: 'p', delta: 1, reason: 'gain' },
      ],
    };
    expect(describeNote(note, names)).toEqual(['Blood Artist (Priya): Ana loses 1, Priya gains 1']);
  });

  it('says when a spell fizzled', () => {
    const note: ReadbackNote = { cause: { stackItem: 'k1', kind: 'spell', card: 'Lightning Bolt', controllerId: 'a', status: 'fizzled' }, entry: { playerStatement: 's1' }, effects: [] };
    expect(describeNote(note, names)).toEqual(['Lightning Bolt (Ana): did nothing, its targets are gone']);
  });

  it('reads what followed a statement as its own lines', () => {
    const note: ReadbackNote = {
      cause: { followsFrom: 'statement' },
      entry: { playerStatement: 's1' },
      effects: [
        { type: 'moved', card: 'Grizzly Bears', ownerId: 'a', from: 'battlefield', to: 'graveyard', how: 'stateBased' },
        { type: 'lost', playerId: 'a', reason: 'life' },
      ],
    };
    expect(describeNote(note, names)).toEqual(['Ana loses the game', 'Dies: Grizzly Bears']);
  });
});

describe('placeNotes (ADR 0136)', () => {
  const note = (entry: ReadbackNote['entry']): ReadbackNote => ({ cause: { followsFrom: 'statement' }, entry, effects: [] });

  it("puts a note under the last statement of its entry, as the entry is listed", () => {
    const n = note({ playerStatement: 's1' });
    const entries = [{ step: 'main1' as const, playerId: 'a', gameAction: { type: 'noBlock' as const }, from: ['s1', 's3'] }];
    expect(placeNotes([n], entries, ['s1', 's2', 's3']).byStatement.get('s3')).toEqual([n]);
  });

  it('puts notes no statement led to at the top', () => {
    const upkeep = note({ step: 'upkeep' });
    const gone = note({ playerStatement: 's9' });
    expect(placeNotes([upkeep, gone], [], ['s1']).top).toEqual([upkeep, gone]);
  });
});
