import type { DeckCard, GameDeck } from '@onthestack/server/decks';
import { useEffect, useState } from 'react';

export interface GameDecks {
  decks: GameDeck[];
  /** Every card in the game's Decks by name, for rules text, printed stats and colours (ADR 0120). */
  cards: Map<string, DeckCard>;
}

/** Each seat's Deck as it was brought to the game, fetched once (ADR 0119, 0129). Null until it arrives or if it fails. */
export function useGameDecks(code: string): GameDecks | null {
  const [decks, setDecks] = useState<GameDecks | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/games/${encodeURIComponent(code)}/cards`)
      .then((res) => (res.ok ? (res.json() as Promise<{ decks: GameDeck[] }>) : null))
      .then((body) => {
        if (!live || !body) return;
        const cards = new Map<string, DeckCard>();
        for (const d of body.decks) for (const c of d.cards) if (!cards.has(c.name)) cards.set(c.name, c);
        setDecks({ decks: body.decks, cards });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [code]);
  return decks;
}
