import type { CardName } from '@onthestack/engine';
import { colorIdentityOf } from './decks/groups.js';

/** What a game needs of a Deck: kept on a seat in the lobby (ADR 0085) and copied at Start (ADR 0050). */
export interface Deck {
  id: string;
  name: string;
  commanders: CardName[];
  /** The commanders' colours in WUBRG order; empty with no commander (ADR 0081). */
  colorIdentity: string[];
}

/** Where a game looks up saved Decks. */
export interface DeckSource {
  get(id: string): Promise<Deck | null>;
}

const SELECT_DECK = `
  SELECT d.id, d.name,
    (SELECT json_group_array(c.name) FROM deck_cards dc JOIN cards c ON c.oracle_id = dc.oracle_id
      WHERE dc.deck_id = d.id AND dc.commander) AS commanders,
    (SELECT json_group_array(json(coalesce(c.data -> '$.color_identity', '[]'))) FROM deck_cards dc
      JOIN cards c ON c.oracle_id = dc.oracle_id WHERE dc.deck_id = d.id AND dc.commander) AS identities
  FROM decks d WHERE d.id = ?`;

/** The shared Deck library in D1 (ADR 0048). */
export function libraryDecks(db: D1Database): DeckSource {
  return {
    async get(id) {
      const row = await db
        .prepare(SELECT_DECK)
        .bind(id)
        .first<{ id: string; name: string; commanders: string; identities: string }>();
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        commanders: JSON.parse(row.commanders) as CardName[],
        colorIdentity: colorIdentityOf(JSON.parse(row.identities) as string[][]),
      };
    },
  };
}
