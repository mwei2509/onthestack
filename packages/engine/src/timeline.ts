import type { GameAction } from './actions.js';
import type { PlayerId, PlayerStatementId } from './ids.js';
import type { Step } from './steps.js';

export interface PlayerStatement {
  id: PlayerStatementId;
  playerId: PlayerId;
  pressedAt: string;
  text: string;
}

/** One entry of the InterpretedTimeline: a GameAction placed in its Step, with the PlayerStatements it came from. */
export interface TimelineEntry {
  step: Step;
  playerId: PlayerId;
  gameAction: GameAction;
  from: PlayerStatementId[];
  /** Said in response to what is on the Stack ("in response to that"), so the Stack waits for it instead of resolving first. */
  response?: boolean;
}
