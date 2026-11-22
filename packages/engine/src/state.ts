import type { Attack, Block, GameAction } from './actions.js';
import type { CardDefinition } from './cards.js';
import type { GameEvent } from './events.js';
import type { AbilityId, CardName, GameEventId, ObjectId, PermanentId, PlayerId, StackItemId } from './ids.js';
import type { Step } from './steps.js';

export interface Player {
  id: PlayerId;
  name: string;
  life: number;
  poison: number;
  /** Combat damage taken, keyed by the commander card that dealt it. */
  commanderDamage: Record<CardName, number>;
  out: boolean;
}

export interface Effect {
  kind: 'set' | 'add' | 'switch';
  power?: number;
  toughness?: number;
  keywords?: string[];
  until: 'endOfTurn' | 'removed';
  timestamp: number;
}

export interface Permanent {
  id: PermanentId;
  card: CardName;
  ownerId: PlayerId;
  controllerId: PlayerId;
  tapped: boolean;
  /** Turn number since which the current controller has controlled it; decides summoning sickness. */
  controlledSince: number;
  damage: number;
  deathtouchDamage: boolean;
  counters: Record<string, number>;
  effects: Effect[];
  isToken: boolean;
  /** A temporary control change, reverted at cleanup. */
  controlUntil?: { revertTo: PlayerId; until: 'endOfTurn' };
}

export interface StackItem {
  id: StackItemId;
  kind: 'spell' | 'trigger' | 'ability';
  ability?: AbilityId;
  controllerId: PlayerId;
  source: { card: CardName; permanentId?: PermanentId; lastKnown?: Partial<Permanent> };
  triggeredBy?: GameEventId;
  matched?: Record<string, ObjectId | PlayerId>;
  targets: ObjectId[];
  gameActions: GameAction[];
  status: 'pending' | 'resolved' | 'countered' | 'fizzled' | 'conditionNotMet';
}

/** A triggered ability that matched a GameEvent and waits for the board to settle before going on the Stack. */
export interface PendingTrigger {
  ability: AbilityId;
  controllerId: PlayerId;
  source: { card: CardName; permanentId?: PermanentId; lastKnown?: Partial<Permanent> };
  triggeredBy: GameEventId;
  matched: Record<string, ObjectId | PlayerId>;
}

export interface DelayedTrigger {
  source: CardName;
  from: string;
  when: string;
  gameActions: GameAction[];
}

export interface CombatState {
  attacks: Attack[];
  blocks: Block[];
  ready: PlayerId[];
}

export interface GameState {
  turn: { number: number; activePlayerId: PlayerId; step: Step };
  turnOrder: PlayerId[];
  players: Record<PlayerId, Player>;
  cards: Record<CardName, CardDefinition>;
  permanents: Record<PermanentId, Permanent>;
  graveyards: Record<PlayerId, CardName[]>;
  exile: { card: CardName; ownerId: PlayerId; note?: string }[];
  commandZone: Record<PlayerId, { card: CardName; casts: number; inZone: boolean } | null>;
  stack: StackItem[];
  combat: CombatState | null;
  delayedTriggers: DelayedTrigger[];
  pendingTriggers: PendingTrigger[];
  gameEventsThisTurn: GameEvent[];
  /** IDs come from these counters, never from randomness, so a replay always produces the same IDs. */
  nextIds: { permanent: number; gameEvent: number; stackItem: number };
}
