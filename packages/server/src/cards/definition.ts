import type { CardDefinition, CardFace } from '@onthestack/engine';
import { colorIdentityOf } from '../decks/groups.js';
import type { CardData } from './scryfall.js';

const SUPERTYPES = new Set(['Basic', 'Legendary', 'Snow', 'World', 'Ongoing', 'Host', 'Elite']);

/** `Legendary Creature — Vampire Knight` → its types, subtypes and whether it's legendary. */
function parseTypeLine(typeLine: string) {
  const [left = '', right = ''] = typeLine.split('—');
  const words = left.trim().split(/\s+/).filter(Boolean);
  return {
    types: words.filter((w) => !SUPERTYPES.has(w)),
    subtypes: right.trim().split(/\s+/).filter(Boolean),
    legendary: words.includes('Legendary'),
  };
}

/** A printed power or toughness: a number, or one that varies, like `*` or `1+*` (ADR 0120). */
function parseStat(value: string | undefined): { value?: number; varies: boolean } {
  if (value === undefined) return { varies: false };
  if (/^-?\d+$/.test(value)) return { value: Number(value), varies: false };
  const lead = /^-?\d+/.exec(value);
  return { value: lead ? Number(lead[0]) : 0, varies: true };
}

const withoutReminders = (text: string) => text.replace(/\([^)]*\)/g, '');

/**
 * The keywords a card has itself: Scryfall's list, kept only where a line of the Oracle text is nothing but keywords
 * ("Flying, vigilance", "Ward {2}"). Scryfall also lists keywords a card grants to others, like Akroma's Memorial's
 * Flying (ADR 0120).
 */
function ownKeywords(listed: string[], oracleText: string): string[] {
  const starts = (item: string) => listed.find((k) => item.toLowerCase().startsWith(k.toLowerCase()));
  const own = new Set<string>();
  for (const line of withoutReminders(oracleText).split('\n')) {
    const items = line.split(/[,;]/).map((i) => i.trim()).filter(Boolean);
    if (items.length === 0) continue;
    const found = items.map(starts);
    if (found.every((k): k is string => k !== undefined)) for (const k of found) own.add(k);
  }
  return listed.filter((k) => own.has(k));
}

/**
 * Turns a stored Scryfall card into the engine's card definition (ADR 0070, 0120). A double-faced, split or adventure
 * card keeps its full name and each face; its own types and power/toughness are its front face's.
 */
export function cardDefinition(data: CardData): CardDefinition {
  const front = data.card_faces?.[0];
  const typeLine = front?.type_line ?? data.type_line?.split(' // ')[0] ?? '';
  const { types, subtypes, legendary } = parseTypeLine(typeLine);
  const power = parseStat(front?.power ?? data.power);
  const toughness = parseStat(front?.toughness ?? data.toughness);
  const keywords = ownKeywords(data.keywords ?? [], front?.oracle_text ?? data.oracle_text ?? '');
  const faces: CardFace[] | undefined = data.card_faces?.map((face) => {
    const parsed = parseTypeLine(face.type_line ?? '');
    const p = parseStat(face.power);
    const t = parseStat(face.toughness);
    return {
      name: face.name,
      types: parsed.types,
      ...(parsed.subtypes.length > 0 ? { subtypes: parsed.subtypes } : {}),
      ...(p.value !== undefined ? { power: p.value } : {}),
      ...(t.value !== undefined ? { toughness: t.value } : {}),
    };
  });
  const cost = data.mana_cost || front?.mana_cost;

  return {
    name: data.name,
    types,
    ...(subtypes.length > 0 ? { subtypes } : {}),
    ...(legendary ? { legendary } : {}),
    ...(cost ? { cost } : {}),
    ...(data.cmc !== undefined ? { manaValue: data.cmc } : {}),
    ...(power.value !== undefined ? { power: power.value } : {}),
    ...(toughness.value !== undefined ? { toughness: toughness.value } : {}),
    ...(power.varies || toughness.varies ? { ptVaries: true } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    colorIdentity: colorIdentityOf([data.color_identity ?? []]),
    ...(faces ? { faces } : {}),
    abilities: [],
  };
}

/** What the interpreter and screens read beside the engine's list: the type line and Oracle text, each face labelled. */
export function cardText(data: CardData): { typeLine: string; oracleText: string } {
  if (!data.card_faces) return { typeLine: data.type_line ?? '', oracleText: data.oracle_text ?? '' };
  return {
    typeLine: data.type_line ?? data.card_faces.map((f) => f.type_line ?? '').join(' // '),
    oracleText: data.card_faces.map((f) => `${f.name}: ${f.oracle_text ?? ''}`.trim()).join('\n'),
  };
}
