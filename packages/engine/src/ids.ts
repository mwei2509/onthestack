export type PlayerId = string;
export type PermanentId = string;
export type StackItemId = string;
export type GameEventId = string;
export type PlayerStatementId = string;
export type CardName = string;
export type AbilityId = string;

export type ObjectId = PermanentId | StackItemId;

/** The id the next Stack item will get. IDs follow the replay, never randomness (ADR 0022). */
export const nextStackItemId = (state: { nextIds: { stackItem: number } }): StackItemId => `k${state.nextIds.stackItem}`;
