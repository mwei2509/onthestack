import { describe, expect, it } from 'vitest';
import { colorIdentityOf, groupOf, isLegendary } from './groups.js';

describe('groupOf', () => {
  it.each([
    ['Legendary Creature — Vampire Knight', 'Creature'],
    ['Artifact Creature — Golem', 'Creature'],
    ['Land Creature — Forest Dryad', 'Creature'],
    ['Legendary Planeswalker — Sarkhan', 'Other permanent'],
    ['Instant', 'Spell'],
    ['Tribal Sorcery — Goblin', 'Spell'],
    ['Artifact', 'Other permanent'],
    ['Artifact Land', 'Land'],
    ['Enchantment — Aura', 'Other permanent'],
    ['Battle — Siege', 'Other permanent'],
    ['Basic Land — Plains', 'Land'],
    ['Land // Land', 'Land'],
    ['Enchantment // Land', 'Other permanent'],
    ['Kindred Instant — Elf', 'Spell'],
    ['Conspiracy', 'Other permanent'],
  ])('%s → %s', (typeLine, group) => {
    expect(groupOf(typeLine)).toBe(group);
  });
});

describe('isLegendary', () => {
  it('reads the front face only', () => {
    expect(isLegendary('Legendary Creature — Vampire Knight')).toBe(true);
    expect(isLegendary('Enchantment — Saga // Legendary Creature — Human')).toBe(false);
    expect(isLegendary('Creature — Vampire')).toBe(false);
  });
});

describe('colorIdentityOf', () => {
  it('joins partners and orders WUBRG', () => {
    expect(colorIdentityOf([['G', 'U'], ['W', 'B']])).toEqual(['W', 'U', 'B', 'G']);
    expect(colorIdentityOf([])).toEqual([]);
  });
});
