import type { CardGroup } from './groups.js';

// What the Deck routes send. Kept free of Worker types so the web app can import it.

/** A line kept on a Deck because it couldn't be read, or names a card the card store can't find (ADR 0077). */
export interface UnmatchedLine {
  text: string;
  reason: 'unreadable' | 'not-found';
}

export interface DeckCard {
  oracleId: string;
  scryfallId: string;
  name: string;
  quantity: number;
  commander: boolean;
  group: CardGroup;
  legendary: boolean;
  /** Its printing has a back face with its own image, at `/api/images/<scryfallId>/back`. */
  doubleFaced: boolean;
  /** The front face's, as Scryfall writes them: `Legendary Creature — Vampire Knight`, `{3}{W}{B}` (empty for lands). */
  typeLine: string;
  manaCost: string;
  manaValue: number;
  /** Every face's Oracle text, front first, separated by a blank line. */
  oracleText: string;
  /** The card's own colour identity, in Scryfall's letters. */
  colorIdentity: string[];
  /** Printed, as Scryfall writes them (`*`, `1+*`); the front face's for a double-faced card. */
  power?: string;
  toughness?: string;
  loyalty?: string;
  /** Whether the app has a Translation for it (ADR 0098). None does until card knowledge reaches games. */
  known: boolean;
}

export interface DeckDetail {
  id: string;
  name: string;
  archidektId: string | null;
  cards: DeckCard[];
  unmatched: UnmatchedLine[];
  importedAt: string;
  /** The commanders' colours together, in WUBRG order; empty with no commander (ADR 0081). */
  colorIdentity: string[];
}

export interface DeckSummary {
  id: string;
  name: string;
  commanders: string[];
  colorIdentity: string[];
  cardCount: number;
  /** Unmatched lines, plus one if no commander is marked. */
  problems: number;
  source: 'archidekt' | 'pasted';
  importedAt: string;
}

/** `GET /api/games/<code>/cards`: each seat's Deck as the version it brought to the game (ADR 0119, 0129). */
export interface GameDeck {
  seatId: string;
  deckId: string;
  name: string;
  colorIdentity: string[];
  cards: DeckCard[];
}
