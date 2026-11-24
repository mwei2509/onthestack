import type { CardName } from '@onthestack/engine';

export interface Deck {
  id: string;
  name: string;
  commanders: CardName[];
}

/** Where the lobby looks up saved Decks. The Deck library (#72) provides the real one; until then there are none (ADR 0064). */
export interface DeckSource {
  get(id: string): Promise<Deck | null>;
}

export const noDecks: DeckSource = { get: async () => null };
