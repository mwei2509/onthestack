const COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const COLLECTION_BATCH = 75;
const COLLECTION_INTERVAL_MS = 500;

// Scryfall rejects requests without an accurate User-Agent and an Accept header.
export const SCRYFALL_HEADERS = {
  'User-Agent': 'OnTheStack/0.1 (+https://onthestack.gg)',
  Accept: 'application/json',
};

interface ImageUris {
  grid?: string;
}

export interface ScryfallFace {
  name: string;
  oracle_id?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: ImageUris;
}

export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  collector_number: string;
  layout: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  keywords?: string[];
  colors?: string[];
  color_identity?: string[];
  card_faces?: ScryfallFace[];
  image_uris?: ImageUris;
}

export type ScryfallIdentifier =
  | { id: string }
  | { set: string; collector_number: string }
  | { oracle_id: string }
  | { name: string };

export class ScryfallUnavailable extends Error {}

export type Sleep = (ms: number) => Promise<void>;

/** Looks up cards through `POST /cards/collection`, 75 identifiers per request and at most two requests a second. */
export async function fetchCollection(
  identifiers: ScryfallIdentifier[],
  fetchImpl: typeof fetch,
  sleep: Sleep,
): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  for (let i = 0; i < identifiers.length; i += COLLECTION_BATCH) {
    if (i > 0) await sleep(COLLECTION_INTERVAL_MS);
    const res = await fetchImpl(COLLECTION_URL, {
      method: 'POST',
      headers: { ...SCRYFALL_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: identifiers.slice(i, i + COLLECTION_BATCH) }),
    });
    if (!res.ok) throw new ScryfallUnavailable(`Scryfall answered ${res.status}`);
    const body = (await res.json()) as { data: ScryfallCard[] };
    cards.push(...body.data);
  }
  return cards;
}

const CARD_FIELDS = [
  'name',
  'mana_cost',
  'cmc',
  'type_line',
  'oracle_text',
  'power',
  'toughness',
  'loyalty',
  'keywords',
  'colors',
  'color_identity',
  'layout',
] as const;

const FACE_FIELDS = ['name', 'mana_cost', 'type_line', 'oracle_text', 'power', 'toughness', 'loyalty'] as const;

function pick<T extends object, K extends keyof T>(from: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) if (from[key] !== undefined) out[key] = from[key];
  return out;
}

export type CardData = Pick<ScryfallCard, (typeof CARD_FIELDS)[number]> & {
  card_faces?: Pick<ScryfallFace, (typeof FACE_FIELDS)[number]>[];
};

/** The fields the card store keeps, under Scryfall's names (ADR 0070). */
export function trimCard(card: ScryfallCard): CardData {
  const data: CardData = pick(card, CARD_FIELDS);
  if (card.card_faces) data.card_faces = card.card_faces.map((face) => pick(face, FACE_FIELDS));
  return data;
}

/** Reversible cards carry their Oracle ID only on their faces, both faces sharing one. */
export function oracleIdOf(card: ScryfallCard): string | undefined {
  return card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
}

export interface Printing {
  scryfallId: string;
  oracleId: string;
  setCode: string;
  collectorNumber: string;
  imageUrl: string | null;
  backImageUrl: string | null;
}

/** A double-faced card has an image per face; any other card has one image on the card itself (ADR 0073). */
export function printingOf(card: ScryfallCard, oracleId: string): Printing {
  const faces = card.card_faces ?? [];
  const front = card.image_uris?.grid ?? faces[0]?.image_uris?.grid ?? null;
  const back = card.image_uris ? null : (faces[1]?.image_uris?.grid ?? null);
  return {
    scryfallId: card.id,
    oracleId,
    setCode: card.set,
    collectorNumber: card.collector_number,
    imageUrl: front,
    backImageUrl: back,
  };
}
