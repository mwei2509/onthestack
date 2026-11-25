import type { CardName, PlayerId } from './ids.js';
import type { GameState } from './state.js';
import type { RulesWarning } from './warnings.js';

const COLOUR_NAMES: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

const describe = (identity: string[]) =>
  identity.length === 0 ? 'colourless' : identity.map((c) => COLOUR_NAMES[c] ?? c).join(' and ');

/**
 * A card outside its player's commander colours (ADR 0110), checked alongside `unknownCard`. A player with no
 * commander, or a card the game doesn't know, gets no colour warning.
 */
export function colourWarning(state: GameState, card: CardName, playerId: PlayerId): RulesWarning | null {
  const allowed = state.players[playerId]?.colorIdentity;
  const identity = state.cards[card]?.colorIdentity;
  if (!allowed || !identity || identity.every((c) => allowed.includes(c))) return null;
  return {
    code: 'outsideColourIdentity',
    message: `${card} is ${describe(identity)}; your commander is ${describe(allowed)}.`,
  };
}
