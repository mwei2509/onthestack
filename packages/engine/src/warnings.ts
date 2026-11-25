import type { PlayerId, PlayerStatementId } from './ids.js';
import type { Step } from './steps.js';

export type RulesWarningCode = 'unknownCard' | 'notALand' | 'notOnBattlefield' | 'unknownPlayer' | 'notYetSupported'
  | 'possibleLoop'
  | 'notOnStack'
  | 'notACreature'
  | 'notYours'
  | 'tapped'
  | 'summoningSickness'
  | 'notAnOpponent'
  | 'notAttacking'
  | 'notTheDefender'
  | 'cantBlockFlyer'
  | 'menace'
  | 'divisionMismatch'
  | 'variablePowerToughness'
  | 'outsideColourIdentity';

/** Flags something that looks wrong. The engine never refuses a GameAction because of one (principle 3). */
export interface RulesWarning {
  code: RulesWarningCode;
  message: string;
  objectIds?: string[];
  /** Offer "Go back" (a take-back to fix the mistake) alongside "Do it anyway" (ADR 0027). */
  goBack?: boolean;
  /** The timeline entry whose GameAction raised it; absent for warnings no entry raised, like a possible loop (ADR 0122). */
  entry?: { step: Step; playerId: PlayerId; from: PlayerStatementId[] };
  /** Who chose "Do it anyway" (ADR 0123). */
  overriddenBy?: PlayerId;
}

/** A player's "Do it anyway", kept by the Game and passed to every replay of the turn (ADR 0123). */
export interface WarningOverride {
  code: RulesWarningCode;
  from: PlayerStatementId[];
  objectIds: string[];
  playerId: PlayerId;
}

/** A PlayerTask its player marked done, kept like an override (ADR 0125). */
export interface PlayerTaskDone {
  playerId: PlayerId;
  text: string;
  from: PlayerStatementId[];
  /** Who marked it done. */
  doneBy: PlayerId;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/** Same code, raised from the same statements, about the same objects (ADR 0123). */
export function overrideMatches(o: Omit<WarningOverride, 'playerId'>, w: RulesWarning): boolean {
  return !!w.entry && o.code === w.code && sameSet(o.from, w.entry.from) && sameSet(o.objectIds, w.objectIds ?? []);
}

/** Same player, text and causing statements (ADR 0125). */
export function taskDoneMatches(d: Omit<PlayerTaskDone, 'doneBy'>, task: { playerId: PlayerId; text: string; from: PlayerStatementId[] }): boolean {
  return d.playerId === task.playerId && d.text === task.text && sameSet(d.from, task.from);
}
