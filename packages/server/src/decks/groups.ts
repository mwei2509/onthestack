/** The Deck page's type groups, in the order a card with several types is placed (ADR 0084). */
export const CARD_GROUPS = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
  'Other',
] as const;
export type CardGroup = (typeof CARD_GROUPS)[number];

/** The supertypes and types of a type line's front face: `Legendary Creature — Vampire // …` → `Legendary Creature`. */
function frontTypes(typeLine: string): string[] {
  const front = typeLine.split(' // ')[0] ?? '';
  return (front.split('—')[0] ?? '').trim().split(/\s+/);
}

export function groupOf(typeLine: string): CardGroup {
  const types = frontTypes(typeLine);
  return CARD_GROUPS.find((g) => types.includes(g)) ?? 'Other';
}

export function isLegendary(typeLine: string): boolean {
  return frontTypes(typeLine).includes('Legendary');
}

/** The colours of all the commanders together, in WUBRG order. */
export function colorIdentityOf(identities: string[][]): string[] {
  const all = new Set(identities.flat());
  return [...'WUBRG'].filter((c) => all.has(c));
}
