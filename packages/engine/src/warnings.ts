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
  | 'divisionMismatch';

/** Flags something that looks wrong. The engine never refuses a GameAction because of one (principle 3). */
export interface RulesWarning {
  code: RulesWarningCode;
  message: string;
  objectIds?: string[];
}
