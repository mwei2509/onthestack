import type { PermanentView, TableView } from '@onthestack/engine';
import { describe, expect, it } from 'vitest';
import { cornerOf, counterBadge, fieldZones, groupCaption } from './layout.js';

let next = 0;
const perm = (card: string, over: Partial<PermanentView> = {}): PermanentView => ({
  id: `p${++next}`,
  card,
  ownerId: 'p1',
  controllerId: 'p1',
  tapped: false,
  controlledSince: 1,
  damage: 0,
  deathtouchDamage: false,
  counters: {},
  effects: [],
  isToken: false,
  isCreature: false,
  types: [],
  ptVaries: false,
  power: 0,
  toughness: 0,
  keywords: [],
  ...over,
});
const creature = (card: string, over: Partial<PermanentView> = {}) => perm(card, { isCreature: true, types: ['Creature'], power: 1, toughness: 1, ...over });
const view = (permanents: PermanentView[], commander?: string) =>
  ({ permanents, commandZone: commander ? { p1: { card: commander, inZone: false } } : {} }) as unknown as Pick<TableView, 'permanents' | 'commandZone'>;

describe('fieldZones (ADR 0126)', () => {
  it('lays a field out creatures first, then other permanents, then lands and non-creature tokens', () => {
    const zones = fieldZones(
      view([perm('Mountain', { types: ['Land'] }), perm('Sol Ring', { types: ['Artifact'] }), creature('Goblin Guide'), perm('Treasure', { isToken: true, types: ['Artifact'] })]),
      'p1',
    );
    expect(zones.map((z) => [z.label, z.groups.map((g) => g.card)])).toEqual([
      ['Creatures', ['Goblin Guide']],
      ['Planeswalkers, artifacts & enchantments', ['Sol Ring']],
      ['Lands & tokens', ['Mountain', 'Treasure']],
    ]);
  });

  it('stacks identical permanents into one fan, counting tapped apart, and keeps changed copies separate', () => {
    const goblins = [creature('Goblin', { isToken: true }), creature('Goblin', { isToken: true, tapped: true }), creature('Goblin', { isToken: true })];
    const pumped = creature('Goblin', { isToken: true, power: 2, toughness: 2, counters: { '+1/+1': 1 } });
    const [zone] = fieldZones(view([...goblins, pumped]), 'p1');
    expect(zone!.groups.map((g) => [g.untapped, g.tapped, g.counters])).toEqual([
      [2, 1, []],
      [1, 0, [{ kind: '+1/+1', count: 1 }]],
    ]);
    expect(groupCaption(zone!.groups[0]!)).toBe('Goblin ×3 · 1 tapped');
  });

  it("shows only that player's permanents, and marks their commander", () => {
    const zones = fieldZones(view([creature('Krenko, Mob Boss'), creature('Grizzly Bears', { controllerId: 'p2' })], 'Krenko, Mob Boss'), 'p1');
    expect(zones.flatMap((z) => z.groups.map(groupCaption))).toEqual(['Krenko, Mob Boss · Commander']);
  });

  it('puts loyalty in the corner and other counters in the badge (ADR 0127)', () => {
    const [zone] = fieldZones(view([perm('Sarkhan, Fireblood', { types: ['Planeswalker'], counters: { loyalty: 3 } })]), 'p1');
    expect(cornerOf(zone!.groups[0]!)).toBe('◆3');
    expect(zone!.groups[0]!.counters).toEqual([]);
    expect(counterBadge({ kind: '+1/+1', count: 2 })).toBe('+1 ×2');
    expect(counterBadge({ kind: 'oil', count: 1 })).toBe('oil 1');
  });

  it("shows the engine's power and toughness, and */* for a card printed with *", () => {
    const [zone] = fieldZones(view([creature('Bears', { power: 3, toughness: 3 }), creature('Tarmogoyf', { ptVaries: true })]), 'p1');
    expect(zone!.groups.map(cornerOf)).toEqual(['3/3', '*/*']);
  });
});
