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
