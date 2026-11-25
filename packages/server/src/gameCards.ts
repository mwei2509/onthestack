import type { CardDefinition, CardName, GameState } from '@onthestack/engine';
import { cardDefinition, cardText } from './cards/definition.js';
import type { CardData } from './cards/scryfall.js';

/** Every card in a game's Deck versions (ADR 0119): the engine's definitions, and the text kept beside them (ADR 0120). */
export interface GameCards {
  definitions: Record<CardName, CardDefinition>;
  text: Record<CardName, { typeLine: string; oracleText: string }>;
}

export const NO_CARDS: GameCards = { definitions: {}, text: {} };

const SELECT_CARDS = `
  SELECT DISTINCT c.name, c.data FROM deck_version_cards dc JOIN cards c ON c.oracle_id = dc.oracle_id
  WHERE dc.version_id IN (SELECT value FROM json_each(?))`;

/** One query for every seat's Deck version, so a waking game makes a single D1 read. */
export async function loadGameCards(db: D1Database, versionIds: string[]): Promise<GameCards> {
  if (versionIds.length === 0) return NO_CARDS;
  const { results } = await db.prepare(SELECT_CARDS).bind(JSON.stringify(versionIds)).all<{ name: string; data: string }>();
  const cards: GameCards = { definitions: {}, text: {} };
  for (const row of results) {
    const data = { ...(JSON.parse(row.data) as CardData), name: row.name };
    cards.definitions[row.name] = cardDefinition(data);
    cards.text[row.name] = cardText(data);
  }
  return cards;
}

/** The state with the Decks' cards added to the engine's list, as replays need. */
export function withCards(state: GameState, cards: GameCards): GameState {
  return { ...state, cards: { ...state.cards, ...cards.definitions } };
}

/**
 * The state with the Decks' cards taken out again, so saved and sealed turns don't carry them (ADR 0119). Tokens
 * made during the game aren't on any Deck, so they stay.
 */
export function withoutDeckCards(state: GameState, cards: GameCards): GameState {
  const kept = Object.fromEntries(Object.entries(state.cards).filter(([name]) => !(name in cards.definitions)));
  return { ...state, cards: kept };
}
