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
}
