import { parseDeckList } from '@onthestack/server/decks/parse';
import type { DeckSummary } from '@onthestack/server/decks';

const DAY = 24 * 60 * 60 * 1000;

/** "today", "yesterday", "3 days ago", "last week", "last month", "in March". Days are the viewer's. */
export function sinceDay(iso: string, now: Date): string {
  const then = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 60) return days < 31 ? `${Math.floor(days / 7)} weeks ago` : 'last month';
  return `in ${then.toLocaleString('en', { month: 'long' })}`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "100 cards · Archidekt · updated today" or "99 cards · pasted list". */
export function deckMeta(deck: Pick<DeckSummary, 'cardCount' | 'source' | 'importedAt'>, now: Date): string {
  const cards = `${deck.cardCount} ${deck.cardCount === 1 ? 'card' : 'cards'}`;
  return deck.source === 'archidekt' ? `${cards} · Archidekt · updated ${sinceDay(deck.importedAt, now)}` : `${cards} · pasted list`;
}

export function matchesSearch(deck: Pick<DeckSummary, 'name' | 'commanders'>, search: string): boolean {
  const q = search.trim().toLowerCase();
  return q === '' || [deck.name, ...deck.commanders].some((s) => s.toLowerCase().includes(q));
}

/** The paste form's Deck name: the commander's name once the list has one, partners joined (ADR 0077). */
export function nameFromList(list: string): string {
  return parseDeckList(list)
    .lines.filter((l) => l.commander)
    .map((l) => l.name.split(' // ')[0])
    .join(' & ');
}

/** How many lines the import will read: every non-blank line, as the button counts them. */
export const lineCount = (list: string) => list.split(/\r?\n/).filter((l) => l.trim() !== '').length;

/** What a fix starts from: a line's card name without its quantity, set or categories. */
export function nameInLine(text: string): string {
  return parseDeckList(text).lines[0]?.name ?? text.trim();
}

/** A picked card name back into a line, keeping the line's quantity. */
export function lineWithName(text: string, name: string): string {
  return `${parseDeckList(text).lines[0]?.quantity ?? 1} ${name}`;
}

/** The commander picker's order (ADR 0083): legendary creatures and planeswalkers first, each part A–Z. */
export function commanderChoices<T extends { name: string; legendary: boolean; typeLine: string }>(cards: T[]): T[] {
  const likely = (c: T) => c.legendary && /\b(Creature|Planeswalker)\b/.test(c.typeLine);
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return [...cards.filter(likely).sort(byName), ...cards.filter((c) => !likely(c)).sort(byName)];
}
