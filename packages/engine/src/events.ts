import type { Attack, Block, Recipient } from './actions.js';
import type { CardName, GameEventId, ObjectId, PermanentId, PlayerId, PlayerStatementId, StackItemId } from './ids.js';
import type { Effect } from './state.js';
import type { TokenDefinition } from './actions.js';
import type { Step, Zone } from './steps.js';

/** Why a GameEvent happened. Every GameEvent has exactly one cause, so the chain can always be followed back. */
export type Cause =
  | { playerStatement: PlayerStatementId }
  | { gameEvent: GameEventId }
  | { stackItem: StackItemId; gameAction?: number; triggeredBy?: GameEventId }
  | { rule: 'turnStructure' | 'combatDamage' | 'stateBasedAction' | 'boardCorrection'; after?: GameEventId };

export type DamageItem = { sourceId: ObjectId; recipient: Recipient; amount: number; combat: boolean; deathtouch?: boolean };

export type GameEventBody =
  | { type: 'PhaseStarted'; step: Step; activePlayerId: PlayerId; turn: number }
  | { type: 'AttackersDeclared'; attacks: Attack[] }
  | { type: 'BlockersDeclared'; blocks: Block[] }
  | { type: 'DamageDealt'; damage: DamageItem[] }
  | { type: 'LifeChanged'; playerId: PlayerId; delta: number; lifeAfter: number; reason: 'damage' | 'gain' | 'loss' | 'payment' }
  | { type: 'SpellCast'; casterId: PlayerId; card: CardName; targets: ObjectId[]; stackItemId: StackItemId; from: Zone }
  | {
      type: 'ZoneChanged';
      objects: ObjectId[];
      card: CardName;
      ownerId: PlayerId;
      from: Zone | 'nowhere';
      /** 'nowhere' means the object left the game, such as a token or a departed player's cards. */
      to: Zone | 'nowhere';
      how?: 'destroy' | 'sacrifice' | 'exile' | 'resolve' | 'stateBased' | 'token';
      /** Set when entering the battlefield. */
      controllerId?: PlayerId;
      tapped?: boolean;
      isToken?: boolean;
      /** A token's characteristics, recorded in the card catalog when it is created. */
      tokenDefinition?: TokenDefinition;
    }
  | { type: 'CountersChanged'; target: Recipient; kind: string; delta: number }
  | { type: 'PlayerLost'; playerId: PlayerId; reason: 'life' | 'poison' | 'commanderDamage' | 'conceded' }
  | { type: 'TapChanged'; permanentId: PermanentId; tapped: boolean }
  | { type: 'ControlChanged'; permanentId: PermanentId; controllerId: PlayerId; until?: 'endOfTurn' }
  | { type: 'EffectAdded'; permanentId: PermanentId; effect: Effect }
  | { type: 'PlayerTaskCreated'; playerId: PlayerId; text: string };

export type GameEvent = GameEventBody & { id: GameEventId; causedBy: Cause };

export type GameEventType = GameEventBody['type'];
