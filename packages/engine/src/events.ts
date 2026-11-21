import type { Attack, Block, Recipient } from './actions.js';
import type { CardName, GameEventId, ObjectId, PlayerId, PlayerStatementId, StackItemId } from './ids.js';
import type { Step, Zone } from './steps.js';

/** Why a GameEvent happened. Every GameEvent has exactly one cause, so the chain can always be followed back. */
export type Cause =
  | { playerStatement: PlayerStatementId }
  | { gameEvent: GameEventId }
  | { stackItem: StackItemId; gameAction: number; triggeredBy?: GameEventId }
  | { rule: 'turnStructure' | 'combatDamage' | 'stateBasedAction' | 'boardCorrection' };

export type DamageItem = { sourceId: ObjectId; recipient: Recipient; amount: number; combat: boolean };

export type GameEventBody =
  | { type: 'PhaseStarted'; step: Step; activePlayerId: PlayerId; turn: number }
  | { type: 'AttackersDeclared'; attacks: Attack[] }
  | { type: 'BlockersDeclared'; blocks: Block[] }
  | { type: 'DamageDealt'; damage: DamageItem[] }
  | { type: 'LifeChanged'; playerId: PlayerId; delta: number; lifeAfter: number; reason: 'damage' | 'gain' | 'loss' | 'payment' }
  | { type: 'SpellCast'; casterId: PlayerId; card: CardName; targets: ObjectId[]; stackItemId: StackItemId }
  | { type: 'ZoneChanged'; objects: ObjectId[]; card: CardName; from: Zone; to: Zone; how?: 'destroy' | 'sacrifice' | 'exile' | 'resolve' | 'stateBased' }
  | { type: 'CountersChanged'; target: Recipient; kind: string; delta: number }
  | { type: 'PlayerLost'; playerId: PlayerId; reason: 'life' | 'poison' | 'commanderDamage' | 'conceded' };

export type GameEvent = GameEventBody & { id: GameEventId; causedBy: Cause };

export type GameEventType = GameEventBody['type'];
