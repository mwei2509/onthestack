import { describe, expect, it } from 'vitest';
import type { DeckCard } from './api.js';
import { groupCards } from './groups.js';

const card = (name: string, group: DeckCard['group'], quantity = 1, commander = false): DeckCard => ({
  name,
  group,
  colorIdentity: [],
  quantity,
  commander,
  oracleId: name,
  scryfallId: name,
  legendary: false,
  doubleFaced: false,
  typeLine: '',
  manaCost: '',
  manaValue: 0,
  oracleText: '',
  known: false,
});

describe('groupCards', () => {
  it('puts the commander first, then the type sections, sorting cards, counting quantities and dropping empty ones', () => {
    const groups = groupCards([
      card('Swamp', 'Land', 11),
      card('Sol Ring', 'Other permanent'),
      card('Plains', 'Land', 11),
      card('Vona', 'Creature', 1, true),
      card('Blood Artist', 'Creature'),
    ]);
    expect(groups.map((g) => [g.label, g.count, g.cards.map((c) => c.name)])).toEqual([
      ['Commander', 1, ['Vona']],
      ['Creatures', 1, ['Blood Artist']],
      ['Other permanents', 1, ['Sol Ring']],
      ['Lands', 22, ['Plains', 'Swamp']],
    ]);
  });
});
