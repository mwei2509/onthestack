import type { AbilityId, CardName } from './ids.js';
import type { GameEventType } from './events.js';
import type { Step, Zone } from './steps.js';

export interface CardDefinition {
  name: CardName;
  cost?: string;
  types: string[];
  legendary?: boolean;
  power?: number;
  toughness?: number;
  keywords?: string[];
  manaValue?: number;
  /** The card's Translation. Empty until milestone 3; players state effects in M1. */
  abilities: AbilityDefinition[];
}

export type AbilityDefinition =
  | TriggeredAbility
  | StaticAbility
  | SpellAbility
  | CastOption
  | { id: AbilityId; kind: 'mana'; note?: string }
  | { id: AbilityId; kind: 'unmodeled'; text: string };

export interface TriggeredAbility {
  id: AbilityId;
  kind: 'triggered';
  when: TriggerCondition;
  if?: InterveningIf;
  effect: EffectTemplate[];
}

export interface StaticAbility {
  id: AbilityId;
  kind: 'static';
  effect: { entersTapped: ObjectFilter | 'self'; unless?: { yourTurnOfGame: { atMost: number } } };
}

export interface SpellAbility {
  id: AbilityId;
  kind: 'spell';
  targets?: ObjectFilter[];
  effect: EffectTemplate[];
}

export interface CastOption {
  id: AbilityId;
  kind: 'castOption';
  name: string;
  cost: string;
  from: Zone;
  then?: { delayedTrigger: { when: string; effect: EffectTemplate[] } };
}

export interface TriggerCondition {
  event: GameEventType;
  step?: Step;
  whose?: 'you' | 'opponent' | 'any';
  to?: Zone;
  from?: Zone;
  object?: ObjectFilter | 'self' | { selfOr: ObjectFilter };
  includes?: 'self';
}

export interface ObjectFilter {
  types?: string[];
  controller?: 'you' | 'opponent' | 'any';
  other?: boolean;
  manaValue?: { atMost?: number; atLeast?: number };
}

export interface InterveningIf {
  lifeGainedThisTurn?: { who: 'you'; atLeast: number };
}

/** A GameAction with blanks ("you", "target", "self") that the engine fills in when a Stack item is created. */
export type EffectTemplate =
  | { gameAction: 'life'; who: 'you' | 'target' | 'eachOpponent'; delta: number }
  | { gameAction: 'move'; object: 'self' | 'target'; to: Zone; how?: 'destroy' | 'sacrifice' | 'exile'; note?: string }
  | { gameAction: 'counters'; object: 'self' | 'target'; kind: string; delta: number }
  | { playerTask: string; who: 'you' | 'defendingPlayer' | 'target' };
