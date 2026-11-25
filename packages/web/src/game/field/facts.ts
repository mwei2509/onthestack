import type { TableView } from '@onthestack/engine';
import type { DeckCard } from '@onthestack/server/decks';
import type { FieldGroup } from './layout.js';

/**
 * What a card's sheet lists about it (ADR 0126, 0127): the engine's power/toughness with the printed value when they
 * differ, loyalty, counters, how many and whether tapped, and whether it's the commander. Facts only, never advice.
 */
export function cardFacts(g: FieldGroup, printed?: Pick<DeckCard, 'power' | 'toughness'>): string[] {
  const facts: string[] = [];
  if (g.isCreature) {
    const now = g.ptVaries ? '*/*' : `${g.power}/${g.toughness}`;
    const was = printed?.power !== undefined && printed.toughness !== undefined ? `${printed.power}/${printed.toughness}` : null;
    facts.push(was && was !== now ? `${now} now · printed ${was}` : now);
  }
  if (g.loyalty !== undefined) facts.push(`Loyalty ${g.loyalty}`);
  for (const c of g.counters) facts.push(`${c.count} ${c.kind} counter${c.count === 1 ? '' : 's'}`);
  const count = g.untapped + g.tapped;
  if (count > 1) facts.push(`${count} on the battlefield${g.tapped ? `, ${g.tapped} tapped` : ''}`);
  else facts.push(g.tapped ? 'Tapped' : 'Untapped');
  if (g.keywords.length) facts.push(g.keywords.join(', '));
  if (g.isToken) facts.push('Token');
  if (g.commander) facts.push('Commander');
  return facts;
}

/** A player's graveyard or exile, newest first (ADR 0126). */
export function pileOf(view: Pick<TableView, 'graveyards' | 'exile'>, playerId: string, zone: 'grave' | 'exile'): string[] {
  const cards = zone === 'grave' ? (view.graveyards[playerId] ?? []) : view.exile.filter((e) => e.ownerId === playerId).map((e) => e.card);
  return [...cards].reverse();
}
