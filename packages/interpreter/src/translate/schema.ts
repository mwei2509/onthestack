import { STEPS, type AbilityDefinition } from '@onthestack/engine';
import { z } from 'zod';

const Range = { atMost: z.number().int().optional(), atLeast: z.number().int().optional() };
const range = z.object(Range);
const relation = z.enum(['you', 'opponent', 'any']);
const zone = z.enum(['battlefield', 'graveyard', 'exile', 'command', 'stack', 'hand', 'library']);
const abilityZone = z.enum(['battlefield', 'graveyard', 'command', 'hand']).optional();

const ObjectFilter = z.object({
  types: z.array(z.string()).optional(),
  subtypes: z.array(z.string()).optional(),
  legendary: z.boolean().optional(),
  token: z.boolean().optional(),
  controller: relation.optional(),
  other: z.boolean().optional(),
  manaValue: range.optional(),
  power: range.optional(),
  toughness: range.optional(),
  tapped: z.boolean().optional(),
  attacking: z.boolean().optional(),
  colors: z.array(z.enum(['W', 'U', 'B', 'R', 'G'])).optional(),
  name: z.string().optional(),
});

const Condition = {
  lifeGainedThisTurn: z.object({ who: z.literal('you'), atLeast: z.number().int() }).optional(),
  youControl: z.object({ filter: ObjectFilter, ...Range }).optional(),
  opponents: range.optional(),
};
const condition = z.object(Condition);

/** Only the GameEvents a trigger can wait for. */
const TriggerCondition = z.object({
  event: z.enum(['ZoneChanged', 'PhaseStarted', 'AttackersDeclared', 'LifeChanged', 'DamageDealt', 'SpellCast']),
  step: z.enum(STEPS).optional(),
  whose: relation.optional(),
  to: zone.optional(),
  from: zone.optional(),
  object: z.union([z.literal('self'), z.object({ selfOr: ObjectFilter }), ObjectFilter]).optional(),
  player: z.enum(['you', 'opponent']).optional(),
  combat: z.boolean().optional(),
  gained: z.boolean().optional(),
});
const when = z.union([TriggerCondition, z.array(TriggerCondition).min(1)]);

const TargetSpec = z.object({
  id: z.string(),
  kind: z.enum(['player', 'permanent', 'cardInGraveyard', 'spell']),
  player: relation.optional(),
  filter: ObjectFilter.optional(),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
});

const Amount = z.union([
  z.number().int(),
  z.object({ count: ObjectFilter }),
  z.object({ x: z.literal(true) }),
  z.object({ powerOf: z.enum(['self', 'matched', 'target']) }),
]);
const target = z.object({ target: z.string() });
const ObjectRef = z.union([z.enum(['self', 'matched']), target]);
const PlayerRef = z.union([z.enum(['you', 'eachOpponent', 'eachPlayer', 'defendingPlayer']), target]);

const EffectTemplate = z.union([
  z.object({ gameAction: z.literal('life'), who: PlayerRef, amount: Amount, lose: z.literal(true).optional() }),
  z.object({ gameAction: z.literal('damage'), to: z.union([PlayerRef, ObjectRef]), amount: Amount }),
  z.object({ gameAction: z.literal('counters'), object: ObjectRef, kind: z.string(), amount: Amount }),
  z.object({
    gameAction: z.literal('createToken'),
    token: z.string(),
    definition: z.object({ types: z.array(z.string()), power: z.number().int().optional(), toughness: z.number().int().optional(), keywords: z.array(z.string()).optional() }),
    count: Amount,
  }),
  z.object({ gameAction: z.literal('modify'), object: ObjectRef, power: z.number().int(), toughness: z.number().int(), keywords: z.array(z.string()).optional() }),
  z.object({ gameAction: z.literal('move'), object: ObjectRef, to: zone, how: z.enum(['destroy', 'sacrifice', 'exile']).optional(), note: z.string().optional() }),
  z.object({ playerTask: z.string(), who: PlayerRef }),
  z.object({ oracle: z.string() }),
]);

/** Every drafted ability carries the Oracle sentence it stands for, so an ability that fails a check can fall back to it. */
const text = z.string().describe('The Oracle sentence or sentences this ability stands for, word for word.');

/** An ability as the model drafts it: the engine's AbilityDefinition without its id (our code numbers them). */
export const AbilityDraft = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('triggered'),
    text,
    when,
    zone: abilityZone,
    limit: z.object({ perTurn: z.number().int().min(1) }).optional(),
    if: condition.optional(),
    condition: condition.optional(),
    optional: z.boolean().optional(),
    targets: z.array(TargetSpec).optional(),
    effect: z.array(EffectTemplate),
  }),
  z.object({
    kind: z.literal('static'),
    text,
    zone: abilityZone,
    effect: z.object({
      entersTapped: z.union([z.literal('self'), ObjectFilter]),
      unless: z.object({ ...Condition, yourTurnOfGame: range.optional(), payLife: z.number().int().min(1).optional() }).optional(),
    }),
  }),
  z.object({ kind: z.literal('alwaysOn'), text, zone: abilityZone, when: when.optional() }),
  z.object({ kind: z.literal('spell'), text, targets: z.array(TargetSpec).optional(), effect: z.array(EffectTemplate) }),
  z.object({ kind: z.literal('mana'), text }),
  z.object({ kind: z.literal('unmodeled'), text }),
]);
export type AbilityDraft = z.infer<typeof AbilityDraft>;

export const TranslationDraft = z.object({ abilities: z.array(AbilityDraft) });
export type TranslationDraft = z.infer<typeof TranslationDraft>;

type Drafted<K extends AbilityDraft['kind']> = Omit<Extract<AbilityDraft, { kind: K }>, 'text' | 'kind'>;
type Engine<K extends AbilityDefinition['kind']> = Omit<Extract<AbilityDefinition, { kind: K }>, 'id' | 'kind'>;

/** Compile-time checks that each drafted kind is a valid engine ability once it has an id. */
export type DraftMatchesEngine = [
  Drafted<'triggered'> extends Engine<'triggered'> ? true : never,
  Drafted<'static'> extends Engine<'static'> ? true : never,
  Drafted<'spell'> extends Engine<'spell'> ? true : never,
];
export const draftMatchesEngine: DraftMatchesEngine = [true, true, true];
