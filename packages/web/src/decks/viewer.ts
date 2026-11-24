import type { DeckCard } from './api.js';
import type { CardGroupView } from './groups.js';

/** The type chips above a Deck's cards (ADR 0097). Creatures includes a creature commander. */
export const CARD_FILTERS = {
  All: () => true,
  Creatures: (c: DeckCard) => c.group === 'Creature',
  Spells: (c: DeckCard) => c.group === 'Spell',
  Lands: (c: DeckCard) => c.group === 'Land',
  Other: (c: DeckCard) => c.group === 'Other permanent',
} as const;
export type CardFilter = keyof typeof CARD_FILTERS;

/** The cards a chip and a search leave: the search matches names and Oracle text, ignoring case. */
export function filterCards(cards: DeckCard[], filter: CardFilter, query: string): DeckCard[] {
  const q = query.trim().toLowerCase();
  return cards.filter((c) => CARD_FILTERS[filter](c) && (q === '' || c.name.toLowerCase().includes(q) || c.oracleText.toLowerCase().includes(q)));
}

/** The cards in the order they're shown, for stepping through them with previous and next. */
export function inShownOrder(groups: CardGroupView[]): DeckCard[] {
  return groups.flatMap((g) => g.cards);
}

/** The card `step` places from `card`, wrapping around; the first card if `card` isn't shown. */
export function stepFrom(shown: DeckCard[], card: DeckCard | null, step: 1 | -1): DeckCard | null {
  if (shown.length === 0) return null;
  const at = card ? shown.findIndex((c) => c.scryfallId === card.scryfallId && c.name === card.name) : -1;
  if (at === -1) return shown[0]!;
  return shown[(at + step + shown.length) % shown.length]!;
}
