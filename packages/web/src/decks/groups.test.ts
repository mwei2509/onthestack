import { describe, expect, it } from 'vitest';
import type { DeckCard } from './api.js';
import { groupCards } from './groups.js';

const card = (name: string, group: DeckCard['group'], quantity = 1): DeckCard => ({
  name,
  group,
  quantity,
  oracleId: name,
  scryfallId: name,
  commander: false,
  legendary: false,
  doubleFaced: false,
});

describe('groupCards', () => {
  it('orders groups by type, sorts cards, counts quantities and drops empty groups', () => {
    const groups = groupCards([card('Swamp', 'Land', 11), card('Sol Ring', 'Artifact'), card('Plains', 'Land', 11), card('Vona', 'Creature')]);
    expect(groups.map((g) => [g.label, g.count, g.cards.map((c) => c.name)])).toEqual([
      ['Creatures', 1, ['Vona']],
      ['Artifacts', 1, ['Sol Ring']],
      ['Lands', 22, ['Plains', 'Swamp']],
    ]);
  });
});
