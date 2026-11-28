import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import type { GameAction } from './actions.js';
import type { CardDefinition } from './cards.js';
import type { GameEvent } from './events.js';
import { readbackNotes } from './readback.js';
import { scenario } from './scenario.js';
import type { Step } from './steps.js';

const creature = (name: string, power: number, toughness: number, keywords: string[] = []): CardDefinition => ({ name, types: ['Creature'], power, toughness, keywords, abilities: [] });

const cards: Record<string, CardDefinition> = {
  Elenda: creature('Elenda', 1, 1, ['Lifelink']),
  'Grizzly Bears': creature('Grizzly Bears', 2, 2),
  'Silvercoat Lion': creature('Silvercoat Lion', 2, 2),
  'Lightning Bolt': { name: 'Lightning Bolt', types: ['Instant'], abilities: [] },
  'Blood Artist': {
    ...creature('Blood Artist', 0, 1),
    abilities: [{
      id: 'blood-artist#1',
      kind: 'triggered',
      when: { event: 'ZoneChanged', from: 'battlefield', to: 'graveyard', object: { selfOr: { types: ['Creature'] } } },
      effect: [{ gameAction: 'life', who: 'eachOpponent', delta: -1 }, { gameAction: 'life', who: 'you', delta: 1 }],
    }],
  },
};

const notesOf = (r: { turnStart: Parameters<typeof readbackNotes>[0]; events: GameEvent[] }) => readbackNotes(r.turnStart, r.events);

describe('readbackNotes', () => {
  it('gives combat damage one note under the attack, with lifelink (game DELTA-TOWER-48)', () => {
    const s = scenario({ seats: ['melissa', 'tester'], life: 40, cards });
    const elenda = s.battlefield('melissa', 'Elenda');
    s.say(1, 'declareAttackers', 'melissa', { type: 'attack', attacks: [{ attackerId: elenda, target: 'tester' }] });
    s.say(1, 'declareBlockers', 'tester', { type: 'noBlock' });
    expect(notesOf(s.runUntil(1, 'main2'))).toEqual([
      {
        cause: { combatDamage: 'combatDamage' },
        entry: { playerStatement: 's1' },
        effects: [
          { type: 'damage', source: { objectId: elenda, card: 'Elenda' }, to: { playerId: 'tester' }, amount: 1 },
          { type: 'life', playerId: 'tester', delta: -1, reason: 'damage' },
          { type: 'life', playerId: 'melissa', delta: 1, reason: 'gain', lifelink: true },
        ],
      },
    ]);
  });

  it('puts deaths from combat damage in the same note, after the damage', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards });
    const lion = s.battlefield('A', 'Silvercoat Lion');
    const bears = s.battlefield('B', 'Grizzly Bears');
    s.say(1, 'declareAttackers', 'A', { type: 'attack', attacks: [{ attackerId: lion, target: 'B' }] });
    s.say(1, 'declareBlockers', 'B', { type: 'block', blocks: [{ blockerId: bears, attackerId: lion }] });
    const notes = notesOf(s.runUntil(1, 'main2'));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.effects.filter((x) => x.type === 'moved').map((x) => x.type === 'moved' && [x.card, x.to])).toEqual([
      ['Silvercoat Lion', 'graveyard'],
      ['Grizzly Bears', 'graveyard'],
    ]);
  });

  it('gives a resolved spell and the trigger it caused a note each, both under the cast', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards });
    s.battlefield('A', 'Blood Artist');
    const bears = s.battlefield('B', 'Grizzly Bears');
    s.say(1, 'main1', 'A', { type: 'cast', card: 'Lightning Bolt', targets: [bears], effects: [{ type: 'damage', sourceId: 'k1', recipient: { permanentId: bears }, amount: 3 }] });
    const notes = notesOf(s.runUntil(1, 'main2'));
    expect(notes.map((n) => [n.cause, n.entry])).toEqual([
      [{ stackItem: 'k1', kind: 'spell', card: 'Lightning Bolt', controllerId: 'A', status: 'resolved' }, { playerStatement: 's1' }],
      [{ stackItem: expect.any(String), kind: 'trigger', card: 'Blood Artist', controllerId: 'A', status: 'resolved' }, { playerStatement: 's1' }],
    ]);
    expect(notes[0]!.effects).toEqual([
      { type: 'damage', source: { objectId: 'k1', card: 'Lightning Bolt' }, to: { objectId: bears, card: 'Grizzly Bears' }, amount: 3 },
      { type: 'moved', card: 'Grizzly Bears', ownerId: 'B', from: 'battlefield', to: 'graveyard', how: 'stateBased' },
    ]);
    expect(notes[1]!.effects).toEqual([
      { type: 'life', playerId: 'B', delta: -1, reason: 'loss' },
      { type: 'life', playerId: 'A', delta: 1, reason: 'gain' },
    ]);
  });

  it('gives what a statement does directly no note, but what the engine adds on top one', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards });
    const bears = s.battlefield('B', 'Grizzly Bears');
    s.say(1, 'main1', 'A', { type: 'life', playerId: 'A', delta: -5 });
    s.say(1, 'main1', 'A', { type: 'damage', sourceId: 'x', recipient: { permanentId: bears }, amount: 2 });
    expect(notesOf(s.runUntil(1, 'main2'))).toEqual([
      {
        cause: { followsFrom: 'statement' },
        entry: { playerStatement: 's2' },
        effects: [{ type: 'moved', card: 'Grizzly Bears', ownerId: 'B', from: 'battlefield', to: 'graveyard', how: 'stateBased' }],
      },
    ]);
  });

  it('gives lifelink on damage a player stated a note of its own', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards });
    const elenda = s.battlefield('A', 'Elenda');
    s.say(1, 'main1', 'A', { type: 'damage', sourceId: elenda, recipient: { playerId: 'B' }, amount: 1 });
    expect(notesOf(s.runUntil(1, 'main2'))).toEqual([
      { cause: { followsFrom: 'statement' }, entry: { playerStatement: 's1' }, effects: [{ type: 'life', playerId: 'A', delta: 1, reason: 'gain', lifelink: true }] },
    ]);
  });

  it('puts a player losing in the note that caused it', () => {
    const s = scenario({ seats: ['A', 'B', 'C'], life: 2, cards });
    const lion = s.battlefield('A', 'Silvercoat Lion');
    s.say(1, 'declareAttackers', 'A', { type: 'attack', attacks: [{ attackerId: lion, target: 'B' }] });
    s.say(1, 'declareBlockers', 'B', { type: 'noBlock' });
    const [note] = notesOf(s.runUntil(1, 'main2'));
    expect(note!.effects.at(-1)).toEqual({ type: 'lost', playerId: 'B', reason: 'life' });
  });

  it('gives turn structure no notes', () => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards });
    s.battlefield('A', 'Grizzly Bears');
    expect(notesOf(s.runUntil(2, 'cleanup'))).toEqual([]);
  });
});

const op = fc.record({
  step: fc.constantFrom<Step>('main1', 'declareAttackers', 'declareBlockers', 'main2'),
  kind: fc.constantFrom('attack', 'noBlock', 'block', 'damage', 'bolt', 'life'),
  player: fc.constantFrom('A', 'B'),
  pick: fc.nat(),
  n: fc.integer({ min: 1, max: 4 }),
});

/** A LifeChanged that is a statement's own effect: stated outright, or the loss from damage a statement dealt. */
const isDirect = (e: GameEvent, events: GameEvent[]) => {
  if ('playerStatement' in e.causedBy) return true;
  if (!('gameEvent' in e.causedBy) || e.type !== 'LifeChanged' || e.reason === 'gain') return false;
  const id = e.causedBy.gameEvent;
  const parent = events.find((x) => x.id === id);
  return parent !== undefined && 'playerStatement' in parent.causedBy;
};

describe('readbackNotes properties', () => {
  test.prop([fc.array(op, { maxLength: 12 })])('every life change is in exactly one note unless a statement made it directly', (ops) => {
    const s = scenario({ seats: ['A', 'B'], life: 20, cards });
    const ids = [s.battlefield('A', 'Elenda'), s.battlefield('A', 'Blood Artist'), s.battlefield('B', 'Grizzly Bears'), s.battlefield('B', 'Blood Artist')];
    const pick = (i: number) => ids[i % ids.length]!;
    ops.forEach((o, i) => {
      const target = pick(o.pick);
      const action: GameAction = {
        attack: { type: 'attack', attacks: [{ attackerId: target, target: o.player === 'A' ? 'B' : 'A' }] },
        noBlock: { type: 'noBlock' },
        block: { type: 'block', blocks: [{ blockerId: target, attackerId: pick(o.pick + 1) }] },
        damage: { type: 'damage', sourceId: pick(o.n), recipient: { permanentId: target }, amount: o.n },
        bolt: { type: 'cast', card: 'Lightning Bolt', targets: [target], effects: [{ type: 'damage', sourceId: `k${i}`, recipient: { permanentId: target }, amount: o.n }] },
        life: { type: 'life', playerId: o.player, delta: -o.n },
      }[o.kind] as GameAction;
      s.say(1, o.step, o.player, action);
    });
    const r = s.runUntil(1, 'end');
    const notes = readbackNotes(r.turnStart, r.events);

    expect(readbackNotes(r.turnStart, r.events)).toEqual(notes);
    const lifeEvents = r.events.filter((e) => e.type === 'LifeChanged');
    const noted = notes.flatMap((n) => n.effects.filter((x) => x.type === 'life'));
    expect(noted.length).toBe(lifeEvents.filter((e) => !isDirect(e, r.events)).length);
    const statements = new Set(ops.map((_, i) => `s${i + 1}`));
    for (const n of notes) {
      if ('playerStatement' in n.entry) expect(statements.has(n.entry.playerStatement)).toBe(true);
      expect(n.effects.length > 0 || ('stackItem' in n.cause && n.cause.status !== 'resolved')).toBe(true);
    }
  });
});
