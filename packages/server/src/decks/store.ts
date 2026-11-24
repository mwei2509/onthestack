import type { CardRequest, CardStore } from '../cards/store.js';
import { parseDeckList, type DeckLine } from './parse.js';

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
}

export interface DeckDetail {
  id: string;
  name: string;
  archidektId: string | null;
  cards: DeckCard[];
  unmatched: UnmatchedLine[];
  importedAt: string;
}

export interface DeckSummary {
  id: string;
  name: string;
  commanders: string[];
  cardCount: number;
  /** Unmatched lines, plus one if no commander is marked. */
  problems: number;
}

export interface DeckStoreDeps {
  db: D1Database;
  cards: CardStore;
  now: () => Date;
  newId: () => string;
}

export interface DeckStore {
  importList(name: string, list: string): Promise<DeckDetail>;
  list(): Promise<DeckSummary[]>;
  get(id: string): Promise<DeckDetail | null>;
}

interface DeckRow {
  id: string;
  name: string;
  archidekt_id: string | null;
  unmatched: string;
  imported_at: string;
}

interface CardRow {
  oracle_id: string;
  scryfall_id: string;
  name: string;
  quantity: number;
  commander: number;
}

interface SummaryRow {
  id: string;
  name: string;
  unmatched: string;
  commanders: string | null;
  card_count: number | null;
}

function requestFor(line: DeckLine): CardRequest {
  return line.set && line.collectorNumber
    ? { set: line.set, collectorNumber: line.collectorNumber, name: line.name }
    : { name: line.name };
}

const INSERT_DECK = `
  INSERT INTO decks (id, name, archidekt_id, unmatched, created_at, imported_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)`;

// D1's free plan allows 50 queries per Worker invocation, so a Deck's cards go in as one statement.
const INSERT_CARDS = `
  INSERT INTO deck_cards (deck_id, position, oracle_id, scryfall_id, quantity, commander)
  SELECT ?1, key, value ->> 'oracleId', value ->> 'scryfallId', value ->> 'quantity', value ->> 'commander'
  FROM json_each(?2)`;

const SELECT_SUMMARIES = `
  SELECT d.id, d.name, d.unmatched,
    (SELECT json_group_array(c.name) FROM deck_cards dc JOIN cards c ON c.oracle_id = dc.oracle_id
      WHERE dc.deck_id = d.id AND dc.commander) AS commanders,
    (SELECT sum(quantity) FROM deck_cards WHERE deck_id = d.id) AS card_count
  FROM decks d ORDER BY d.name COLLATE NOCASE`;

export function createDeckStore({ db, cards, now, newId }: DeckStoreDeps): DeckStore {
  async function get(id: string): Promise<DeckDetail | null> {
    const [decks, rows] = await db.batch([
      db.prepare('SELECT id, name, archidekt_id, unmatched, imported_at FROM decks WHERE id = ?').bind(id),
      db
        .prepare(
          `SELECT dc.oracle_id, dc.scryfall_id, c.name, dc.quantity, dc.commander
           FROM deck_cards dc JOIN cards c ON c.oracle_id = dc.oracle_id
           WHERE dc.deck_id = ? ORDER BY dc.position`,
        )
        .bind(id),
    ]);
    const deck = (decks!.results as DeckRow[])[0];
    if (!deck) return null;
    return {
      id: deck.id,
      name: deck.name,
      archidektId: deck.archidekt_id,
      cards: (rows!.results as CardRow[]).map((r) => ({
        oracleId: r.oracle_id,
        scryfallId: r.scryfall_id,
        name: r.name,
        quantity: r.quantity,
        commander: r.commander === 1,
      })),
      unmatched: JSON.parse(deck.unmatched) as UnmatchedLine[],
      importedAt: deck.imported_at,
    };
  }

  return {
    async importList(name, list) {
      const parsed = parseDeckList(list);
      const resolved = await cards.resolve(parsed.lines.map(requestFor));

      const deckCards: Omit<DeckCard, 'name'>[] = [];
      const unmatched: (UnmatchedLine & { lineNumber: number })[] = parsed.unreadable.map((u) => ({
        lineNumber: u.lineNumber,
        text: u.text,
        reason: 'unreadable',
      }));
      parsed.lines.forEach((line, i) => {
        const card = resolved[i];
        if (card) deckCards.push({ ...card, quantity: line.quantity, commander: line.commander });
        else unmatched.push({ lineNumber: line.lineNumber, text: line.text, reason: 'not-found' });
      });
      unmatched.sort((a, b) => a.lineNumber - b.lineNumber);

      const id = newId();
      await db.batch([
        db
          .prepare(INSERT_DECK)
          .bind(id, name, null, JSON.stringify(unmatched.map(({ text, reason }) => ({ text, reason }))), now().toISOString()),
        db.prepare(INSERT_CARDS).bind(id, JSON.stringify(deckCards.map((c) => ({ ...c, commander: c.commander ? 1 : 0 })))),
      ]);
      return (await get(id))!;
    },

    async list() {
      const { results } = await db.prepare(SELECT_SUMMARIES).all<SummaryRow>();
      return results.map((r) => {
        const commanders = JSON.parse(r.commanders ?? '[]') as string[];
        const unmatched = JSON.parse(r.unmatched) as UnmatchedLine[];
        return {
          id: r.id,
          name: r.name,
          commanders,
          cardCount: r.card_count ?? 0,
          problems: unmatched.length + (commanders.length === 0 ? 1 : 0),
        };
      });
    },

    get,
  };
}
