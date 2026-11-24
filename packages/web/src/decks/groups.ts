import type { DeckCard } from './api.js';

const ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Other'] as const;
const PLURAL: Record<(typeof ORDER)[number], string> = {
  Creature: 'Creatures',
  Planeswalker: 'Planeswalkers',
  Battle: 'Battles',
  Instant: 'Instants',
  Sorcery: 'Sorceries',
  Artifact: 'Artifacts',
  Enchantment: 'Enchantments',
  Land: 'Lands',
  Other: 'Other',
};

export interface CardGroupView {
  group: DeckCard['group'];
  label: string;
  count: number;
  cards: DeckCard[];
}

/** The Deck page's type groups (ADR 0084), empty ones left out, cards A–Z, counts by quantity. */
export function groupCards(cards: DeckCard[]): CardGroupView[] {
  return ORDER.map((group) => {
    const inGroup = cards.filter((c) => c.group === group).sort((a, b) => a.name.localeCompare(b.name));
    return { group, label: PLURAL[group], count: inGroup.reduce((n, c) => n + c.quantity, 0), cards: inGroup };
  }).filter((g) => g.cards.length > 0);
}
