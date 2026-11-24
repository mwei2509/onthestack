import {
  fetchCollection,
  oracleIdOf,
  printingOf,
  trimCard,
  type CardData,
  type Printing,
  type ScryfallCard,
  type ScryfallIdentifier,
  type Sleep,
} from './scryfall.js';

/**
 * One card an import asks for, by the most specific thing the Deck line gave (ADR 0049).
 * A name given alongside a printing must match that printing's card, or the line is unmatched.
 */
export type CardRequest =
  | { scryfallId: string; name?: string }
  | { set: string; collectorNumber: string; name?: string }
  | { oracleId: string }
  | { name: string };

export interface ResolvedCard {
  oracleId: string;
  scryfallId: string;
}

export interface CardStoreDeps {
  db: D1Database;
  fetch: typeof fetch;
  sleep: Sleep;
  now: () => Date;
}

export interface CardStore {
  /** Resolves each request from D1, fetching the rest from Scryfall and storing them. `null` means unmatched. */
  resolve(requests: CardRequest[]): Promise<(ResolvedCard | null)[]>;
  get(oracleIds: string[]): Promise<Map<string, CardData>>;
}

interface Candidate {
  oracleId: string;
  scryfallId: string;
  setCode: string;
  collectorNumber: string;
  data: CardData;
}

interface CandidateRow {
  oracle_id: string;
  scryfall_id: string | null;
  set_code: string | null;
  collector_number: string | null;
  data: string;
}

const fold = (s: string) => s.trim().toLowerCase();

function namesOf(data: Pick<CardData, 'name' | 'card_faces'>): string[] {
  return [data.name, ...(data.card_faces ?? []).map((face) => face.name)].map(fold);
}

function satisfies(request: CardRequest, c: Candidate): boolean {
  if ('scryfallId' in request) return fold(request.scryfallId) === c.scryfallId;
  if ('set' in request) return fold(request.set) === fold(c.setCode) && request.collectorNumber.trim() === c.collectorNumber;
  if ('oracleId' in request) return fold(request.oracleId) === c.oracleId;
  return namesOf(c.data).includes(fold(request.name));
}

function nameAgrees(request: CardRequest, c: Candidate): boolean {
  return !('name' in request) || request.name === undefined || namesOf(c.data).includes(fold(request.name));
}

function toIdentifier(request: CardRequest): ScryfallIdentifier {
  if ('scryfallId' in request) return { id: request.scryfallId.trim() };
  if ('set' in request) return { set: request.set.trim(), collector_number: request.collectorNumber.trim() };
  if ('oracleId' in request) return { oracle_id: request.oracleId.trim() };
  return { name: frontName(request.name) };
}

/** Scryfall's collection lookup never matches a two-faced card's full "Front // Back" name, only its front's. */
const frontName = (name: string) => name.split(' // ')[0]!.trim();

function fromRow(row: CandidateRow): Candidate | null {
  if (!row.scryfall_id) return null;
  return {
    oracleId: row.oracle_id,
    scryfallId: row.scryfall_id,
    setCode: row.set_code ?? '',
    collectorNumber: row.collector_number ?? '',
    data: JSON.parse(row.data) as CardData,
  };
}

const PRINTINGS_BY_ID_OR_NUMBER = `
  SELECT p.oracle_id, p.scryfall_id, p.set_code, p.collector_number, c.data
  FROM printings p JOIN cards c ON c.oracle_id = p.oracle_id
  WHERE p.scryfall_id IN (SELECT value FROM json_each(?1))
     OR (p.set_code || '/' || p.collector_number) COLLATE NOCASE IN (SELECT value FROM json_each(?2))`;

// A card found by Oracle ID or name reuses any printing already stored for it (ADR 0073).
const CARDS_BY_ORACLE_ID_OR_NAME = `
  SELECT c.oracle_id, p.scryfall_id, p.set_code, p.collector_number, c.data
  FROM cards c
  LEFT JOIN printings p ON p.scryfall_id = (
    SELECT scryfall_id FROM printings WHERE oracle_id = c.oracle_id ORDER BY scryfall_id LIMIT 1
  )
  WHERE c.oracle_id IN (SELECT value FROM json_each(?1))
     OR c.name IN (SELECT value FROM json_each(?2))
     OR substr(c.name, 1, instr(c.name, ' // ') - 1) COLLATE NOCASE IN (SELECT value FROM json_each(?2))`;

const UPSERT_CARDS = `
  INSERT INTO cards (oracle_id, name, data, fetched_at)
  SELECT value ->> 'oracleId', value ->> 'name', value ->> 'data', ?2 FROM json_each(?1) WHERE true
  ON CONFLICT (oracle_id) DO UPDATE SET name = excluded.name, data = excluded.data, fetched_at = excluded.fetched_at`;

const UPSERT_PRINTINGS = `
  INSERT INTO printings (scryfall_id, oracle_id, set_code, collector_number, image_url, back_image_url)
  SELECT value ->> 'scryfallId', value ->> 'oracleId', value ->> 'setCode', value ->> 'collectorNumber',
         value ->> 'imageUrl', value ->> 'backImageUrl'
  FROM json_each(?1) WHERE true
  ON CONFLICT (scryfall_id) DO UPDATE SET
    oracle_id = excluded.oracle_id, set_code = excluded.set_code, collector_number = excluded.collector_number,
    image_url = excluded.image_url, back_image_url = excluded.back_image_url`;

export function createCardStore({ db, fetch, sleep, now }: CardStoreDeps): CardStore {
  // D1's free plan allows 50 queries per Worker invocation, so lookups and writes are a few set-based statements, never one per card.
  async function stored(requests: CardRequest[]): Promise<Candidate[]> {
    const ids: string[] = [];
    const numbers: string[] = [];
    const oracleIds: string[] = [];
    const names: string[] = [];
    for (const r of requests) {
      if ('scryfallId' in r) ids.push(fold(r.scryfallId));
      else if ('set' in r) numbers.push(`${r.set.trim()}/${r.collectorNumber.trim()}`);
      else if ('oracleId' in r) oracleIds.push(fold(r.oracleId));
      else names.push(r.name.trim());
    }
    const [printings, cards] = await db.batch<CandidateRow>([
      db.prepare(PRINTINGS_BY_ID_OR_NUMBER).bind(JSON.stringify(ids), JSON.stringify(numbers)),
      db.prepare(CARDS_BY_ORACLE_ID_OR_NAME).bind(JSON.stringify(oracleIds), JSON.stringify(names)),
    ]);
    return [...printings!.results, ...cards!.results].map(fromRow).filter((c) => c !== null);
  }

  async function store(cards: ScryfallCard[]): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const printings: Printing[] = [];
    const rows = new Map<string, { oracleId: string; name: string; data: string }>();
    for (const card of cards) {
      const oracleId = oracleIdOf(card);
      if (!oracleId) continue;
      const data = trimCard(card);
      const printing = printingOf(card, oracleId);
      rows.set(oracleId, { oracleId, name: card.name, data: JSON.stringify(data) });
      printings.push(printing);
      candidates.push({ ...printing, data });
    }
    if (candidates.length > 0) {
      await db.batch([
        db.prepare(UPSERT_CARDS).bind(JSON.stringify([...rows.values()]), now().toISOString()),
        db.prepare(UPSERT_PRINTINGS).bind(JSON.stringify(printings)),
      ]);
    }
    return candidates;
  }

  return {
    async resolve(requests) {
      const found: (Candidate | null)[] = requests.map(() => null);
      const local = await stored(requests);
      requests.forEach((r, i) => (found[i] = local.find((c) => satisfies(r, c)) ?? null));

      const missing = requests.flatMap((r, i) => (found[i] ? [] : [r]));
      if (missing.length > 0) {
        const unique = new Map(missing.map((r) => [JSON.stringify(toIdentifier(r)), toIdentifier(r)]));
        const fetched = await store(await fetchCollection([...unique.values()], fetch, sleep));
        requests.forEach((r, i) => {
          if (!found[i]) found[i] = fetched.find((c) => satisfies(r, c)) ?? null;
        });
      }

      return requests.map((r, i) => {
        const c = found[i];
        return c && nameAgrees(r, c) ? { oracleId: c.oracleId, scryfallId: c.scryfallId } : null;
      });
    },

    async get(oracleIds) {
      const { results } = await db
        .prepare('SELECT oracle_id, data FROM cards WHERE oracle_id IN (SELECT value FROM json_each(?1))')
        .bind(JSON.stringify(oracleIds))
        .all<{ oracle_id: string; data: string }>();
      return new Map(results.map((row) => [row.oracle_id, JSON.parse(row.data) as CardData]));
    },
  };
}
