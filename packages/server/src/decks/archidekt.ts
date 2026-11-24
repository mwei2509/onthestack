import type { CardRequest } from '../cards/store.js';

// Archidekt has no official API; its deck endpoint is fetched once per import a player asks for (ADR 0006).
const DECK_URL = (id: string) => `https://archidekt.com/api/decks/${id}/`;
const HEADERS = { 'User-Agent': 'OnTheStack/0.1 (+https://onthestack.gg)', Accept: 'application/json' };

const LINK = /^(?:https?:\/\/)?(?:www\.)?archidekt\.com\/(?:api\/)?decks\/(\d{1,12})(?:[/?#].*)?$/i;

/** The Archidekt deck id in a link like `https://archidekt.com/decks/28451037/vona`, or null if it isn't one. */
export function archidektIdOf(link: string): string | null {
  return LINK.exec(link.trim())?.[1] ?? null;
}

export interface ArchidektDeck {
  id: number;
  name: string;
  categories: { name: string; includedInDeck: boolean; isPremier: boolean }[];
  cards: {
    quantity: number;
    categories: string[] | null;
    card: {
      uid: string;
      collectorNumber: string;
      edition: { editioncode: string };
      oracleCard: { name: string; uid: string };
    };
  }[];
}

export class ArchidektUnavailable extends Error {}

export async function fetchArchidektDeck(id: string, fetchImpl: typeof fetch): Promise<ArchidektDeck> {
  const res = await fetchImpl(DECK_URL(id), { headers: HEADERS });
  if (res.status === 404 || res.status === 403) {
    throw new ArchidektUnavailable(
      "Archidekt didn't return that Deck. If it's private, make it public or paste its text export instead.",
    );
  }
  if (!res.ok) throw new ArchidektUnavailable("Archidekt isn't answering. Try again, or paste the Deck's text export.");
  return (await res.json()) as ArchidektDeck;
}

/** One card of an Archidekt Deck, ready for the card store, with the line a player would see if it doesn't match. */
export interface ArchidektEntry {
  request: CardRequest;
  quantity: number;
  commander: boolean;
  text: string;
}

const LEFT_OUT = new Set(['sideboard', 'maybeboard']);

/**
 * Archidekt counts a Sideboard category as in the Deck, but ADR 0049 leaves Sideboard and Maybeboard out,
 * so a card is dropped if any of its categories is either of those or is marked not in the Deck.
 */
export function entriesOf(deck: ArchidektDeck): ArchidektEntry[] {
  const category = new Map(deck.categories.map((c) => [c.name, c]));
  return deck.cards.flatMap(({ quantity, categories, card }) => {
    const cats = categories ?? [];
    const leftOut = cats.some((name) => LEFT_OUT.has(name.toLowerCase()) || category.get(name)?.includedInDeck === false);
    if (leftOut || quantity < 1) return [];
    const name = card.oracleCard.name;
    return [
      {
        request: { scryfallId: card.uid, name },
        quantity,
        commander: cats.some((name) => category.get(name)?.isPremier === true),
        text: `${quantity}x ${name} (${card.edition.editioncode}) ${card.collectorNumber}`,
      },
    ];
  });
}
