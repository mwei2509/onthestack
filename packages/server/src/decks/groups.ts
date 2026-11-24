/** The Deck page's sections after Commander (ADR 0097). */
export const CARD_GROUPS = ['Creature', 'Other permanent', 'Spell', 'Land'] as const;
export type CardGroup = (typeof CARD_GROUPS)[number];

/** The supertypes and types of a type line's front face: `Legendary Creature — Vampire // …` → `Legendary Creature`. */
function frontTypes(typeLine: string): string[] {
  const front = typeLine.split(' // ')[0] ?? '';
  return (front.split('—')[0] ?? '').trim().split(/\s+/);
}

/** A creature first, then a land, so an artifact land is a Land and Dryad Arbor a Creature (ADR 0097). */
export function groupOf(typeLine: string): CardGroup {
  const types = frontTypes(typeLine);
  if (types.includes('Creature')) return 'Creature';
  if (types.includes('Land')) return 'Land';
  if (types.includes('Instant') || types.includes('Sorcery')) return 'Spell';
  return 'Other permanent';
}

export function isLegendary(typeLine: string): boolean {
  return frontTypes(typeLine).includes('Legendary');
}

/** The colours of all the commanders together, in WUBRG order. */
export function colorIdentityOf(identities: string[][]): string[] {
  const all = new Set(identities.flat());
  return [...'WUBRG'].filter((c) => all.has(c));
}
