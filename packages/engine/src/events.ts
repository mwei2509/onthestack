import type { Attack, Block, Recipient } from './actions.js';
import type { AbilityId, CardName, GameEventId, ObjectId, PermanentId, PlayerId, PlayerStatementId, StackItemId } from './ids.js';
import type { Effect, StackItem } from './state.js';
import type { GameAction, TokenDefinition } from './actions.js';
import type { Step, Zone } from './steps.js';

/** Why a GameEvent happened. Every GameEvent has exactly one cause, so the chain can always be followed back. */
export type Cause =
  | { playerStatement: PlayerStatementId }
  | { gameEvent: GameEventId }
  | { stackItem: StackItemId; gameAction?: number; triggeredBy?: GameEventId }
  | { rule: 'turnStructure' | 'combatDamage' | 'stateBasedAction' | 'boardCorrection'; after?: GameEventId };

/**
 * Why something changed zones: the categories Arena's engine attaches to every zone transfer (ADR 0036), plus ours
 * that Arena expresses differently (`stateBased`, `token`, `fizzled`).
 */
export type ZoneMoveReason =
  | 'castSpell'
  | 'resolve'
  | 'draw'
  | 'playLand'
  | 'exile'
  | 'destroy'
  | 'sacrifice'
  | 'surveil'
  | 'mill'
  | 'return'
  | 'put'
  | 'warp'
  | 'countered'
  | 'stateBased'
  | 'token'
  | 'fizzled';

/** One object's part in a ZoneChanged. */
export interface ZoneMove {
  /** Its ID in the zone it left or entered; absent for a card moving between graveyard, exile and the command zone. */
  objectId?: ObjectId;
  card: CardName;
  ownerId: PlayerId;
  /** Set when entering the battlefield. */
  controllerId?: PlayerId;
  tapped?: boolean;
  isToken?: boolean;
  /** A token's characteristics, recorded in the card catalog when it is created. */
  tokenDefinition?: TokenDefinition;
  /** The static ability that made it enter tapped, if any. */
  entersTappedBecause?: AbilityId;
  /** For a state-based move, the GameEvent that brought it about (the lethal damage, the shrinking effect). */
  after?: GameEventId;
}

export type DamageItem = { sourceId: ObjectId; recipient: Recipient; amount: number; combat: boolean; deathtouch?: boolean };

export type GameEventBody =
  | { type: 'PhaseStarted'; step: Step; activePlayerId: PlayerId; turn: number }
  | { type: 'AttackersDeclared'; attacks: Attack[] }
  | { type: 'BlockersDeclared'; defenderId: PlayerId; blocks: Block[] }
  | { type: 'DamageAssignmentSet'; attackerId: PermanentId; split: Record<string, number> }
  | { type: 'CombatEnded' }
  /** Cleanup's changes, all at one moment (CR 514.2), listed so nothing ends unseen (ADR 0021). */
  | {
      type: 'CleanedUp';
      damageRemoved: { permanentId: PermanentId; amount: number }[];
      effectsEnded: { permanentId: PermanentId; timestamp: number }[];
      controlReturned: { permanentId: PermanentId; to: PlayerId }[];
    }
  | { type: 'DamageDealt'; damage: DamageItem[] }
  | { type: 'LifeChanged'; playerId: PlayerId; delta: number; lifeAfter: number; reason: 'damage' | 'gain' | 'loss' | 'payment' }
  | { type: 'SpellCast'; casterId: PlayerId; card: CardName; targets: ObjectId[]; stackItemId: StackItemId; from: Zone; gameActions: GameAction[] }
  | { type: 'StackItemResolved'; stackItemId: StackItemId; status: 'resolved' | 'countered' | 'fizzled' | 'conditionNotMet' }
  | { type: 'AbilityTriggered'; stackItem: StackItem }
  | {
      type: 'ZoneChanged';
      from: Zone | 'nowhere';
      /** 'nowhere' means the object left the game, such as a token or a departed player's cards. */
      to: Zone | 'nowhere';
      how?: ZoneMoveReason;
      /** Everything that moved at this one moment; simultaneous moves share one GameEvent (ADR 0026). */
      moves: ZoneMove[];
    }
  | { type: 'CountersChanged'; target: Recipient; kind: string; delta: number }
  | { type: 'PlayerLost'; playerId: PlayerId; reason: 'life' | 'poison' | 'commanderDamage' | 'conceded' }
  | { type: 'TapChanged'; permanentId: PermanentId; tapped: boolean }
  | { type: 'ControlChanged'; permanentId: PermanentId; controllerId: PlayerId; until?: 'endOfTurn' }
  | { type: 'EffectAdded'; permanentId: PermanentId; effect: Effect };

export type GameEvent = GameEventBody & { id: GameEventId; causedBy: Cause };

export type GameEventType = GameEventBody['type'];

/**
 * The app's own record of something at the table that isn't part of the game (ADR 0020): it never changes the
 * board, no trigger sees it, and it isn't stored in GameState, so folding GameEvents alone still rebuilds the board.
 */
export type TableEventBody =
  | { type: 'PlayerTaskCreated'; playerId: PlayerId; text: string }
  /** A BoardCorrection (ADR 0034): who corrected what, and the GameEvents it produced. */
  | { type: 'BoardCorrectionMade'; playerId: PlayerId; gameAction: GameAction; gameEvents: GameEventId[] };

/** A TableEvent before replay has given it an ID. */
export type TableEventDraft = TableEventBody & { causedBy: Cause };

export type TableEvent = TableEventDraft & { id: string };
