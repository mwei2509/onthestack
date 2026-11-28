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
  /** Their commander's colour identity in WUBRG order, both commanders' with partners; absent with no commander (ADR 0110). */
  colorIdentity?: string[];
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
  /**
   * Who it was taken from, when an effect changed its control: they get it back when an "until end of turn" change
   * ends at cleanup, or when the player who took it leaves the game (CR 800.4a, ADR 0029).
   */
  controlChange?: { revertTo: PlayerId; until?: 'endOfTurn' };
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
  /** "You may": applied unless a player says otherwise (ADR 0139). */
  optional?: true;
  /** The Oracle sentences for what the engine doesn't apply itself, shown on this item's readback note (ADR 0140). */
  reminders?: string[];
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
  /** Attacked players who have answered, by blocking or taking it. */
  ready: PlayerId[];
  /** Damage divisions players stated for blocked attackers, keyed by attacker (ADR 0012). */
  divisions: Record<PermanentId, Record<string, number>>;
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
