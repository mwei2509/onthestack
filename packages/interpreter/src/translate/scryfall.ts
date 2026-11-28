import type { CardText } from './translate.js';

const HEADERS = { 'User-Agent': 'OnTheStack/0.1 (+https://onthestack.gg)', Accept: 'application/json' };

interface NamedCard {
  name: string;
  type_line?: string;
  oracle_text?: string;
  card_faces?: { name: string; type_line?: string; oracle_text?: string }[];
}

/** A card's text from Scryfall by exact name, each face labelled as the game's card text labels them. */
export async function fetchCardText(name: string, fetchImpl: typeof fetch = fetch): Promise<CardText> {
  const res = await fetchImpl(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Scryfall has no card named "${name}" (${res.status})`);
  const card = (await res.json()) as NamedCard;
  if (!card.card_faces) return { name: card.name, typeLine: card.type_line ?? '', oracleText: card.oracle_text ?? '' };
  return {
    name: card.name,
    typeLine: card.type_line ?? card.card_faces.map((f) => f.type_line ?? '').join(' // '),
    oracleText: card.card_faces.map((f) => `${f.name}: ${f.oracle_text ?? ''}`.trim()).join('\n'),
  };
}
