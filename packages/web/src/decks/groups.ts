import type { DeckCard } from './api.js';

const SECTIONS = [
  { group: 'Commander', label: 'Commander', has: (c: DeckCard) => c.commander },
  { group: 'Creature', label: 'Creatures', has: (c: DeckCard) => !c.commander && c.group === 'Creature' },
  { group: 'Other permanent', label: 'Other permanents', has: (c: DeckCard) => !c.commander && c.group === 'Other permanent' },
  { group: 'Spell', label: 'Spells', has: (c: DeckCard) => !c.commander && c.group === 'Spell' },
  { group: 'Land', label: 'Lands', has: (c: DeckCard) => !c.commander && c.group === 'Land' },
] as const;

export interface CardGroupView {
  group: (typeof SECTIONS)[number]['group'];
  label: string;
  count: number;
  cards: DeckCard[];
}

/** The Deck page's sections (ADR 0097), empty ones left out, cards A–Z, counts by quantity. */
export function groupCards(cards: DeckCard[]): CardGroupView[] {
  return SECTIONS.map(({ group, label, has }) => {
    const inGroup = cards.filter(has).sort((a, b) => a.name.localeCompare(b.name));
    return { group, label, count: inGroup.reduce((n, c) => n + c.quantity, 0), cards: inGroup };
  }).filter((g) => g.cards.length > 0);
}
