import type { TokenDefinition } from './actions.js';
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
  /** "You may": applied unless a player says otherwise (ADR 0139). */
  optional?: boolean;
  targets?: TargetSpec[];
  effect: EffectTemplate[];
}

/** A target an ability names. The conversation chooses it; until then an effect that needs it becomes a PlayerTask (ADR 0138). */
export interface TargetSpec {
  id: string;
  kind: 'player' | 'permanent' | 'cardInGraveyard' | 'spell';
  /** For a player target, relative to the ability's controller. */
  player?: 'you' | 'opponent' | 'any';
  filter?: ObjectFilter;
  min?: number;
  max?: number;
}

/**
 * How many. A count is of permanents you'd see on the battlefield; `powerOf` reads the object's current power, and
 * `matched` is the object the trigger matched. `x` is the spell's X, which a trigger never has.
 */
export type Amount = number | { count: ObjectFilter } | { x: true } | { powerOf: 'self' | 'matched' | 'target' };

export type StaticAbility = EntersTappedAbility | AlwaysOnAbility;

export interface EntersTappedAbility {
  id: AbilityId;
  kind: 'static';
  zone?: AbilityZone;
  effect: { entersTapped: ObjectFilter | 'self'; unless?: EntersUntappedIf };
}

/**
 * A continuous or replacement effect the engine doesn't apply (M3): its Oracle reminder, shown on each GameEvent its
 * `when` matches, or never during play without one (ADR 0139).
 */
export interface AlwaysOnAbility {
  id: AbilityId;
  kind: 'static';
  zone?: AbilityZone;
  when?: TriggerCondition | TriggerCondition[];
  effect: { oracle: string };
}

export interface SpellAbility {
  id: AbilityId;
  kind: 'spell';
  targets?: TargetSpec[];
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
  /** How many opponents are still in the game. */
  opponents?: Range;
}

/**
 * What lets a land that enters tapped enter untapped instead (check lands, fast lands, shock lands). Every field given
 * must hold. `payLife` holds only when its controller said they paid it (ADR 0133); the engine never pays on a guess.
 */
export type EntersUntappedIf = Condition & { yourTurnOfGame?: Range; payLife?: number };

/** An object an effect acts on: the ability's source, the object its trigger matched, or one of its targets by id. */
export type ObjectRef = 'self' | 'matched' | { target: string };

/** A player an effect acts on, relative to the ability's controller. */
export type PlayerRef = 'you' | 'eachOpponent' | 'eachPlayer' | 'defendingPlayer' | { target: string };

/**
 * A GameAction with blanks that the engine fills in when the ability triggers and again when it resolves, or an
 * Oracle reminder: the sentence for whatever the engine doesn't apply itself (ADR 0131, 0140).
 */
export type EffectTemplate =
  | { gameAction: 'life'; who: PlayerRef; amount: Amount; lose?: true }
  | { gameAction: 'damage'; to: PlayerRef | ObjectRef; amount: Amount }
  | { gameAction: 'counters'; object: ObjectRef; kind: string; amount: Amount }
  | { gameAction: 'createToken'; token: CardName; definition: TokenDefinition; count: Amount }
  | { gameAction: 'modify'; object: ObjectRef; power: number; toughness: number; keywords?: string[] }
  | { gameAction: 'move'; object: ObjectRef; to: Zone; how?: 'destroy' | 'sacrifice' | 'exile'; note?: string }
  | { playerTask: string; who: PlayerRef }
  | { oracle: string };
