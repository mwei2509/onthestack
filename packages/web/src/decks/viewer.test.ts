import { describe, expect, it } from 'vitest';
import type { DeckCard } from './api.js';
import { groupCards } from './groups.js';
import { filterCards, inShownOrder, stepFrom } from './viewer.js';

const card = (name: string, group: DeckCard['group'], oracleText = '', commander = false): DeckCard => ({
  name,
  group,
  oracleText,
  commander,
  quantity: 1,
  oracleId: name,
  scryfallId: name,
  legendary: false,
  doubleFaced: false,
  typeLine: '',
  manaCost: '',
  manaValue: 0,
  known: false,
});

const deck = [
  card('The Ur-Dragon', 'Creature', 'Flying', true),
  card('Goldspan Dragon', 'Creature', 'Flying, haste\nWhenever Goldspan Dragon attacks, create a Treasure token.'),
  card('Sol Ring', 'Other permanent', '{T}: Add {C}{C}.'),
  card('Cultivate', 'Spell', 'Search your library for up to two basic land cards'),
  card('Command Tower', 'Land', '{T}: Add one mana of any color'),
];
const names = (cards: DeckCard[]) => cards.map((c) => c.name);

describe('filterCards', () => {
  it('keeps the chosen type, counting a creature commander as a creature', () => {
    expect(names(filterCards(deck, 'Creatures', ''))).toEqual(['The Ur-Dragon', 'Goldspan Dragon']);
    expect(names(filterCards(deck, 'Other', ''))).toEqual(['Sol Ring']);
    expect(filterCards(deck, 'All', '')).toHaveLength(5);
  });

  it('searches names and Oracle text, ignoring case, within the chosen type', () => {
    expect(names(filterCards(deck, 'All', 'treasure'))).toEqual(['Goldspan Dragon']);
    expect(names(filterCards(deck, 'All', '  DRAGON '))).toEqual(['The Ur-Dragon', 'Goldspan Dragon']);
    expect(names(filterCards(deck, 'Lands', 'add'))).toEqual(['Command Tower']);
  });
});

describe('stepping through the shown cards', () => {
  const shown = inShownOrder(groupCards(deck));

  it('follows the sections in order and wraps around', () => {
    expect(names(shown)).toEqual(['The Ur-Dragon', 'Goldspan Dragon', 'Sol Ring', 'Cultivate', 'Command Tower']);
    expect(stepFrom(shown, shown[4]!, 1)?.name).toBe('The Ur-Dragon');
    expect(stepFrom(shown, shown[0]!, -1)?.name).toBe('Command Tower');
  });

  it('starts from the first card when the open one is filtered out', () => {
    expect(stepFrom(shown, card('Rhystic Study', 'Other permanent'), 1)?.name).toBe('The Ur-Dragon');
    expect(stepFrom([], null, 1)).toBeNull();
  });
});
