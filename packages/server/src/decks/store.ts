import type { CardRequest, CardStore, ResolvedCard } from '../cards/store.js';
import { entriesOf, type ArchidektDeck } from './archidekt.js';
import type { DeckCard, DeckDetail, DeckSummary, UnmatchedLine } from './api.js';
import { colorIdentityOf, groupOf, isLegendary } from './groups.js';
import { parseDeckList, type DeckLine } from './parse.js';

/** What a Deck stores per card; the rest of `DeckCard` is read from the card store. */
type SavedCard = Pick<DeckCard, 'oracleId' | 'scryfallId' | 'quantity' | 'commander'>;

export interface DeckStoreDeps {
  db: D1Database;
  cards: CardStore;
  now: () => Date;
  newId: () => string;
}

/** A line of an import in order: a card to resolve, or text that couldn't be read. */
type Entry =
  | { request: CardRequest; quantity: number; commander: boolean; text: string }
  | { text: string };

export interface DeckStore {
  importList(name: string, list: string): Promise<DeckDetail>;
  /** Saves an Archidekt Deck, replacing the Deck an earlier import of the same Archidekt Deck made (ADR 0050, 0079). */
  importArchidekt(deck: ArchidektDeck): Promise<{ deck: DeckDetail; updated: boolean }>;
  list(): Promise<DeckSummary[]>;
  get(id: string): Promise<DeckDetail | null>;
  rename(id: string, name: string): Promise<DeckDetail | null>;
  /** Anyone can delete a Deck (ADR 0079); its versions stay, since games may refer to them (ADR 0119). */
  remove(id: string): Promise<boolean>;
  /** Marks one card, or two for partners, as the commander, replacing any marked before (ADR 0077). */
  markCommanders(id: string, oracleIds: string[]): Promise<DeckDetail | null>;
  /** Replaces an unmatched line's text and matches it again; it joins the Deck's cards if it now matches. */
  fixLine(id: string, line: LineRef, text: string): Promise<DeckDetail | null>;
  skipLine(id: string, line: LineRef): Promise<DeckDetail | null>;
}

/**
 * Names an unmatched line by its position and the text the player saw. If the text no longer matches,
 * someone else changed the Deck in between, and the change is refused rather than applied to another line.
 */
export interface LineRef {
  index: number;
  was: string;
}

export class DeckChanged extends Error {}
export class NotOnDeck extends Error {}

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
  type_line: string | null;
  color_identity: string | null;
  double_faced: number;
  mana_cost: string | null;
  mana_value: number | null;
  oracle_text: string | null;
  face_texts: string | null;
}

interface SummaryRow {
  id: string;
  name: string;
  unmatched: string;
  archidekt_id: string | null;
  imported_at: string;
  commanders: string | null;
  identities: string | null;
  card_count: number | null;
}

function requestFor(line: DeckLine): CardRequest {
  return line.set && line.collectorNumber
    ? { set: line.set, collectorNumber: line.collectorNumber, name: line.name }
    : { name: line.name };
}

const INSERT_DECK = `
  INSERT INTO decks (id, name, archidekt_id, unmatched, created_at, imported_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)`;

/**
 * A Deck's cards live in versions, `<deck id>.<number>`, and `decks.version` is the current number (ADR 0119). Every
 * change to the cards is one batch: bump the number, record the version, write its cards. Statements in a batch run
 * in order, so each one below reads the number the bump just set.
 */
const CURRENT = "d.id || '.' || d.version";

const BUMP_VERSION = 'UPDATE decks SET version = version + 1 WHERE id = ?1';

const RECORD_VERSION = `
  INSERT INTO deck_versions (id, deck_id, number, created_at)
  SELECT ${CURRENT}, d.id, d.version, ?2 FROM decks d WHERE d.id = ?1`;

// D1's free plan allows 50 queries per Worker invocation, so a Deck's cards go in as one statement.
const INSERT_CARDS = `
  INSERT INTO deck_version_cards (version_id, position, oracle_id, scryfall_id, quantity, commander)
  SELECT (SELECT ${CURRENT} FROM decks d WHERE d.id = ?1),
    key, value ->> 'oracleId', value ->> 'scryfallId', value ->> 'quantity', value ->> 'commander'
  FROM json_each(?2)`;

/** Copies the previous version's cards into the new one; `?2` lists the commanders' oracle ids, or null to keep them. */
const COPY_CARDS = `
  INSERT INTO deck_version_cards (version_id, position, oracle_id, scryfall_id, quantity, commander)
  SELECT ${CURRENT}, dc.position, dc.oracle_id, dc.scryfall_id, dc.quantity,
    CASE WHEN ?2 IS NULL THEN dc.commander ELSE dc.oracle_id IN (SELECT value FROM json_each(?2)) END
  FROM decks d JOIN deck_version_cards dc ON dc.version_id = d.id || '.' || (d.version - 1)
  WHERE d.id = ?1`;

const APPEND_CARD = `
  INSERT INTO deck_version_cards (version_id, position, oracle_id, scryfall_id, quantity, commander)
  SELECT ${CURRENT}, coalesce(max(dc.position) + 1, 0), ?2, ?3, ?4, ?5
  FROM decks d LEFT JOIN deck_version_cards dc ON dc.version_id = ${CURRENT}
  WHERE d.id = ?1`;

// A double-faced card's type and cost are its front face's (ADR 0084, 0096).
const TYPE_LINE = "coalesce(c.data ->> '$.card_faces[0].type_line', c.data ->> '$.type_line')";
const MANA_COST = "coalesce(c.data ->> '$.mana_cost', c.data ->> '$.card_faces[0].mana_cost')";
const FACE_TEXTS = "(SELECT json_group_array(f.value ->> '$.oracle_text') FROM json_each(c.data, '$.card_faces') f)";

const SELECT_SUMMARIES = `
  SELECT d.id, d.name, d.unmatched, d.archidekt_id, d.imported_at,
    (SELECT json_group_array(c.name) FROM deck_version_cards dc JOIN cards c ON c.oracle_id = dc.oracle_id
      WHERE dc.version_id = ${CURRENT} AND dc.commander) AS commanders,
    (SELECT json_group_array(json(coalesce(c.data -> '$.color_identity', '[]'))) FROM deck_version_cards dc
      JOIN cards c ON c.oracle_id = dc.oracle_id WHERE dc.version_id = ${CURRENT} AND dc.commander) AS identities,
    (SELECT sum(quantity) FROM deck_version_cards WHERE version_id = ${CURRENT}) AS card_count
  FROM decks d ORDER BY d.name COLLATE NOCASE`;

export function createDeckStore({ db, cards, now, newId }: DeckStoreDeps): DeckStore {
  async function get(id: string): Promise<DeckDetail | null> {
    const [decks, rows] = await db.batch([
      db.prepare('SELECT id, name, archidekt_id, unmatched, imported_at FROM decks WHERE id = ?').bind(id),
      db
        .prepare(
          `SELECT dc.oracle_id, dc.scryfall_id, c.name, dc.quantity, dc.commander,
             ${TYPE_LINE} AS type_line, c.data -> '$.color_identity' AS color_identity,
             coalesce(p.back_image_url, '') != '' AS double_faced,
             ${MANA_COST} AS mana_cost, c.data ->> '$.cmc' AS mana_value,
             c.data ->> '$.oracle_text' AS oracle_text, ${FACE_TEXTS} AS face_texts
           FROM decks d JOIN deck_version_cards dc ON dc.version_id = ${CURRENT}
           JOIN cards c ON c.oracle_id = dc.oracle_id
           LEFT JOIN printings p ON p.scryfall_id = dc.scryfall_id
           WHERE d.id = ? ORDER BY dc.position`,
        )
        .bind(id),
    ]);
    const deck = (decks!.results as DeckRow[])[0];
    if (!deck) return null;
    const cardRows = rows!.results as CardRow[];
    return {
      id: deck.id,
      name: deck.name,
      archidektId: deck.archidekt_id,
      cards: cardRows.map((r) => ({
        oracleId: r.oracle_id,
        scryfallId: r.scryfall_id,
        name: r.name,
        quantity: r.quantity,
        commander: r.commander === 1,
        group: groupOf(r.type_line ?? ''),
        legendary: isLegendary(r.type_line ?? ''),
        doubleFaced: r.double_faced === 1,
        typeLine: r.type_line ?? '',
        manaCost: r.mana_cost ?? '',
        manaValue: r.mana_value ?? 0,
        oracleText: r.oracle_text ?? (JSON.parse(r.face_texts ?? '[]') as (string | null)[]).filter(Boolean).join('\n\n'),
        known: false,
      })),
      unmatched: JSON.parse(deck.unmatched) as UnmatchedLine[],
      importedAt: deck.imported_at,
      colorIdentity: colorIdentityOf(
        cardRows.filter((r) => r.commander === 1).map((r) => JSON.parse(r.color_identity ?? '[]') as string[]),
      ),
    };
  }

  async function unmatchedOf(id: string): Promise<UnmatchedLine[] | null> {
    const row = await db.prepare('SELECT unmatched FROM decks WHERE id = ?').bind(id).first<{ unmatched: string }>();
    return row ? (JSON.parse(row.unmatched) as UnmatchedLine[]) : null;
  }

  function withoutLine(unmatched: UnmatchedLine[], line: LineRef): UnmatchedLine[] {
    if (unmatched[line.index]?.text !== line.was) throw new DeckChanged();
    return unmatched.filter((_, i) => i !== line.index);
  }

  async function resolveEntries(entries: Entry[]) {
    const wanted = entries.filter((e) => 'request' in e);
    const resolved = await cards.resolve(wanted.map((e) => e.request));
    const found = new Map<Entry, ResolvedCard | null | undefined>(wanted.map((e, i) => [e, resolved[i]]));
    const deckCards: SavedCard[] = [];
    const unmatched: UnmatchedLine[] = [];
    for (const e of entries) {
      const card = found.get(e);
      if (!('request' in e)) unmatched.push({ text: e.text, reason: 'unreadable' });
      else if (!card) unmatched.push({ text: e.text, reason: 'not-found' });
      else deckCards.push({ ...card, quantity: e.quantity, commander: e.commander });
    }
    return { deckCards, unmatched };
  }

  const insertCards = (id: string, deckCards: SavedCard[]) =>
    db.prepare(INSERT_CARDS).bind(id, JSON.stringify(deckCards.map((c) => ({ ...c, commander: c.commander ? 1 : 0 }))));

  const recordVersion = (id: string) => db.prepare(RECORD_VERSION).bind(id, now().toISOString());

  /** The first statements of a batch that changes a Deck's cards: a new version, then what goes in it. */
  const newVersion = (id: string) => [db.prepare(BUMP_VERSION).bind(id), recordVersion(id)];

  const setUnmatched = (id: string, unmatched: UnmatchedLine[]) =>
    db.prepare('UPDATE decks SET unmatched = ? WHERE id = ?').bind(JSON.stringify(unmatched), id);

  return {
    async importList(name, list) {
      const parsed = parseDeckList(list);
      const entries: Entry[] = [
        ...parsed.lines.map((line) => ({ ...line, request: requestFor(line) })),
        ...parsed.unreadable,
      ].sort((a, b) => a.lineNumber - b.lineNumber);
      const id = newId();
      const { deckCards, unmatched } = await resolveEntries(entries);
      await db.batch([
        db.prepare(INSERT_DECK).bind(id, name, null, JSON.stringify(unmatched), now().toISOString()),
        recordVersion(id),
        insertCards(id, deckCards),
      ]);
      return (await get(id))!;
    },

    async importArchidekt(deck) {
      const archidektId = String(deck.id);
      const name = deck.name.trim().slice(0, 60) || 'Archidekt Deck';
      const { deckCards, unmatched } = await resolveEntries(entriesOf(deck));
      const existing = await db
        .prepare('SELECT id FROM decks WHERE archidekt_id = ?')
        .bind(archidektId)
        .first<{ id: string }>();

      // Re-importing replaces everything on the Deck, its name included (ADR 0079).
      const id = existing?.id ?? newId();
      await db.batch(
        existing
          ? [
              db
                .prepare('UPDATE decks SET name = ?2, unmatched = ?3, imported_at = ?4 WHERE id = ?1')
                .bind(id, name, JSON.stringify(unmatched), now().toISOString()),
              ...newVersion(id),
              insertCards(id, deckCards),
            ]
          : [
              db.prepare(INSERT_DECK).bind(id, name, archidektId, JSON.stringify(unmatched), now().toISOString()),
              recordVersion(id),
              insertCards(id, deckCards),
            ],
      );
      return { deck: (await get(id))!, updated: existing !== null };
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
          colorIdentity: colorIdentityOf(JSON.parse(r.identities ?? '[]') as string[][]),
          cardCount: r.card_count ?? 0,
          problems: unmatched.length + (commanders.length === 0 ? 1 : 0),
          source: r.archidekt_id ? 'archidekt' : 'pasted',
          importedAt: r.imported_at,
        };
      });
    },

    get,

    async rename(id, name) {
      const { meta } = await db.prepare('UPDATE decks SET name = ? WHERE id = ?').bind(name, id).run();
      return meta.changes > 0 ? get(id) : null;
    },

    async remove(id) {
      const { meta } = await db.prepare('DELETE FROM decks WHERE id = ?').bind(id).run();
      return meta.changes > 0;
    },

    async markCommanders(id, oracleIds) {
      const deck = await get(id);
      if (!deck) return null;
      if (!oracleIds.every((o) => deck.cards.some((c) => c.oracleId === o))) throw new NotOnDeck();
      await db.batch([...newVersion(id), db.prepare(COPY_CARDS).bind(id, JSON.stringify(oracleIds))]);
      return get(id);
    },

    async fixLine(id, line, text) {
      const unmatched = await unmatchedOf(id);
      if (!unmatched) return null;
      const rest = withoutLine(unmatched, line);

      const parsed = parseDeckList(text);
      const cardLine = parsed.lines.length === 1 && parsed.unreadable.length === 0 ? parsed.lines[0]! : null;
      const card = cardLine ? (await cards.resolve([requestFor(cardLine)]))[0] : null;

      if (!cardLine || !card) {
        const still: UnmatchedLine = { text: text.trim(), reason: cardLine ? 'not-found' : 'unreadable' };
        await setUnmatched(id, unmatched.map((u, i) => (i === line.index ? still : u))).run();
      } else {
        await db.batch([
          setUnmatched(id, rest),
          ...newVersion(id),
          db.prepare(COPY_CARDS).bind(id, null),
          db.prepare(APPEND_CARD).bind(id, card.oracleId, card.scryfallId, cardLine.quantity, cardLine.commander ? 1 : 0),
        ]);
      }
      return get(id);
    },

    async skipLine(id, line) {
      const unmatched = await unmatchedOf(id);
      if (!unmatched) return null;
      await setUnmatched(id, withoutLine(unmatched, line)).run();
      return get(id);
    },
  };
}
