export type RulesWarningCode = 'unknownCard' | 'notALand' | 'notOnBattlefield' | 'unknownPlayer' | 'notYetSupported';

/** Flags something that looks wrong. The engine never refuses a GameAction because of one (principle 3). */
export interface RulesWarning {
  code: RulesWarningCode;
  message: string;
  objectIds?: string[];
}
