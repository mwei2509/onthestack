import type { CardName, ObjectId, PermanentId, PlayerId, StackItemId } from './ids.js';
import type { ZoneMoveReason } from './events.js';
import type { Zone } from './steps.js';

export type Recipient = { playerId: PlayerId } | { permanentId: PermanentId };

export interface TokenDefinition {
  types: string[];
  power?: number;
  toughness?: number;
  keywords?: string[];
}

export interface Attack {
  attackerId: PermanentId;
  target: PlayerId;
}

export interface Block {
  blockerId: PermanentId;
  attackerId: PermanentId;
}

/** One literal thing done to the board (ADR 0013). Speech and card Translations are both turned into these. */
export type GameAction =
  | {
      type: 'cast';
      card: CardName;
      targets?: ObjectId[];
      /** What the spell does when it resolves. In M1 players state it ("Murder on Serra Angel"); from M3 the card's Translation supplies it. */
      effects?: GameAction[];
    }
  | { type: 'counter'; stackItemId: StackItemId }
  | { type: 'playLand'; card: CardName }
  | { type: 'move'; objectId: PermanentId; to: Zone; how?: Extract<ZoneMoveReason, 'destroy' | 'sacrifice' | 'exile' | 'return' | 'put' | 'mill' | 'surveil' | 'warp' | 'draw'> }
  | { type: 'tap' | 'untap'; permanentId: PermanentId }
  | { type: 'gainControl'; permanentId: PermanentId; until?: 'endOfTurn' }
  | { type: 'counters'; target: Recipient; kind: string; delta: number }
  | { type: 'modify'; permanentId: PermanentId; power: number; toughness: number; keywords?: string[]; until: 'endOfTurn' }
  | { type: 'createToken'; token: CardName; count: number; definition?: TokenDefinition }
  | { type: 'life'; playerId: PlayerId; delta: number }
  | { type: 'damage'; sourceId: ObjectId; recipient: Recipient; amount: number }
  | { type: 'attack'; attacks: Attack[] }
  | { type: 'block'; blocks: Block[] }
  | { type: 'noBlock' }
  | { type: 'doneAttacking' }
  | { type: 'divideDamage'; attackerId: PermanentId; split: Record<string, number> }
  | { type: 'playerTask'; playerId: PlayerId; text: string };

export type GameActionType = GameAction['type'];
