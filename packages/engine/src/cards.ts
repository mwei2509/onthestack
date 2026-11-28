import type { AbilityId, CardName } from './ids.js';
import type { GameEventType } from './events.js';
import type { Step, Zone } from './steps.js';

export interface CardDefinition {
  name: CardName;
  cost?: string;
  types: string[];
  subtypes?: string[];
  legendary?: boolean;
  power?: number;
  toughness?: number;
  /**
   * Power or toughness printed with `*` (ADR 0120). The table says the number: such a creature isn't killed by
   * toughness 0 and deals no combat damage automatically.
   */
  ptVaries?: boolean;
  keywords?: string[];
  manaValue?: number;
  /** In WUBRG order. Absent when Scryfall gives colours only per face, so a colour filter matches nothing then. */
  colors?: string[];
  /** In WUBRG order. */
  colorIdentity?: string[];
  /** A double-faced, split or adventure card's faces; the card's own fields are its front face's (ADR 0120). */
  faces?: CardFace[];
  /** The card's Translation (ADR 0131). Empty for a card without one, whose effects players say. */
  abilities: AbilityDefinition[];
}

export interface CardFace {
  name: CardName;
  types: string[];
  subtypes?: string[];
  power?: number;
  toughness?: number;
}

export type AbilityDefinition =
  | TriggeredAbility
  | StaticAbility
  | SpellAbility
  | CastOption
  | { id: AbilityId; kind: 'mana'; note?: string }
  | { id: AbilityId; kind: 'unmodeled'; text: string };

/** Where an ability works from. Hands aren't tracked, so an ability that works from a hand never triggers on its own. */
export type AbilityZone = 'battlefield' | 'graveyard' | 'command' | 'hand';

export interface TriggeredAbility {
  id: AbilityId;
  kind: 'triggered';
  /** Several for "enters or attacks": any one of them triggers it. */
  when: TriggerCondition | TriggerCondition[];
  /** The battlefield when absent. */
  zone?: AbilityZone;
  /** "This ability triggers only once each turn." */
  limit?: { perTurn: number };
  /** An intervening-if, checked when it triggers and again when it resolves (CR 603.4). */
  if?: Condition;
  /** Checked only when it triggers. */
  condition?: Condition;
  effect: EffectTemplate[];
}

export interface StaticAbility {
  id: AbilityId;
  kind: 'static';
  zone?: AbilityZone;
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
  /** For AttackersDeclared, the attacker. */
  object?: ObjectFilter | 'self' | { selfOr: ObjectFilter };
  /** For LifeChanged, SpellCast and DamageDealt: whose life, whose spell or who was dealt damage, relative to the ability's controller. */
  player?: 'you' | 'opponent';
  /** For DamageDealt: only combat damage. */
  combat?: boolean;
  /** For LifeChanged: only life gained. */
  gained?: boolean;
}

export interface Range {
  atMost?: number;
  atLeast?: number;
}

/** Every field given must hold. Lists match when any one of their items does. */
export interface ObjectFilter {
  types?: string[];
  subtypes?: string[];
  legendary?: boolean;
  token?: boolean;
  controller?: 'you' | 'opponent' | 'any';
  other?: boolean;
  manaValue?: Range;
  power?: Range;
  toughness?: Range;
  tapped?: boolean;
  attacking?: boolean;
  colors?: string[];
  name?: CardName;
}

/** Every field given must hold. */
export interface Condition {
  lifeGainedThisTurn?: { who: 'you'; atLeast: number };
  youControl?: { filter: ObjectFilter } & Range;
}

/** A GameAction with blanks ("you", "target", "self") that the engine fills in when a Stack item is created. */
export type EffectTemplate =
  | { gameAction: 'life'; who: 'you' | 'target' | 'eachOpponent'; delta: number }
  | { gameAction: 'move'; object: 'self' | 'target'; to: Zone; how?: 'destroy' | 'sacrifice' | 'exile'; note?: string }
  | { gameAction: 'counters'; object: 'self' | 'target'; kind: string; delta: number }
  | { playerTask: string; who: 'you' | 'defendingPlayer' | 'target' };
