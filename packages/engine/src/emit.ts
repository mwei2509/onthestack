import type { Cause, GameEvent, GameEventBody } from './events.js';
import { reduceInto } from './reduce.js';
import type { GameState } from './state.js';

/** Gives a GameEvent its ID and cause, folds it into the draft state, and records it. */
export function emit(draft: GameState, events: GameEvent[], body: GameEventBody, causedBy: Cause): GameEvent {
  const event = { ...body, id: `e${draft.nextIds.gameEvent++}`, causedBy } as GameEvent;
  reduceInto(draft, event);
  events.push(event);
  return event;
}
