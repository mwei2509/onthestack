import { STEPS, ZONES } from '@onthestack/engine';
import { z } from 'zod';

const PlayerId = z.string().describe("A player's id, as listed in the seats");
const StatementId = z.string().describe('A PlayerStatement id from the TurnTranscript');

/** An object referred to the way players do (ADR 0038); the interpreter resolves it to an id by replaying. */
export const CardRef = z.object({
  card: z.string().describe('The card or token name, exactly as it appears on the board or in the Decks'),
  controller: PlayerId.optional().describe('Who controls it, when more than one player has one'),
});

const PlayerRef = z.object({ player: PlayerId });
const Recipient = z.union([PlayerRef, CardRef]);

const until = z.literal('endOfTurn');

const Cast = z.object({
  type: z.literal('cast'),
  card: z.string(),
  targets: z.array(Recipient).optional(),
  get effects(): z.ZodOptional<z.ZodArray<typeof InterpretedGameAction>> {
    return z.array(InterpretedGameAction).optional().describe('What the spell does when it resolves, as the player said it');
  },
});

export const InterpretedGameAction = z.discriminatedUnion('type', [
  Cast,
  z.object({ type: z.literal('counter'), spell: CardRef.describe('The spell on the Stack being countered') }),
  z.object({ type: z.literal('playLand'), card: z.string() }),
  z.object({ type: z.literal('move'), object: CardRef, to: z.enum(ZONES), how: z.enum(['destroy', 'sacrifice', 'exile']).optional() }),
  z.object({ type: z.literal('tap'), object: CardRef }),
  z.object({ type: z.literal('untap'), object: CardRef }),
  z.object({ type: z.literal('gainControl'), object: CardRef, until: until.optional() }),
  z.object({ type: z.literal('counters'), target: Recipient, kind: z.string(), delta: z.number().int() }),
  z.object({
    type: z.literal('modify'),
    object: CardRef,
    power: z.number().int(),
    toughness: z.number().int(),
    keywords: z.array(z.string()).optional(),
    until,
  }),
  z.object({
    type: z.literal('createToken'),
    token: z.string(),
    count: z.number().int().positive(),
    definition: z
      .object({
        types: z.array(z.string()),
        power: z.number().int().optional(),
        toughness: z.number().int().optional(),
        keywords: z.array(z.string()).optional(),
      })
      .optional(),
  }),
  z.object({ type: z.literal('life'), player: PlayerId, delta: z.number().int() }),
  z.object({ type: z.literal('damage'), source: CardRef, recipient: Recipient, amount: z.number().int().nonnegative() }),
  z.object({ type: z.literal('attack'), attacks: z.array(z.object({ attacker: CardRef, target: PlayerId })).min(1) }),
  z.object({ type: z.literal('block'), blocks: z.array(z.object({ blocker: CardRef, attacker: CardRef })).min(1) }),
  z.object({ type: z.literal('noBlock') }),
  z.object({ type: z.literal('doneAttacking') }),
  z.object({
    type: z.literal('divideDamage'),
    attacker: CardRef,
    split: z.array(z.object({ to: Recipient, amount: z.number().int().nonnegative() })).min(1),
  }),
  z.object({ type: z.literal('playerTask'), player: PlayerId, text: z.string() }),
]);

export const TimelineEntry = z.object({
  step: z.enum(STEPS),
  player: PlayerId.describe('Who did it'),
  action: InterpretedGameAction,
  from: z.array(StatementId).min(1).describe('The statements this came from'),
  response: z.boolean().optional().describe('Said in response to something still on the Stack'),
});

export const QUESTION_KINDS = ['chooseOption', 'yesNo', 'chooseObjects', 'choosePlayers', 'chooseNumber', 'whichStep', 'tellHidden'] as const;

/** ADR 0043: what the interpreter couldn't settle, asked instead of guessed. */
export const InterpretedQuestion = z.object({
  kind: z.enum(QUESTION_KINDS),
  askPlayer: PlayerId,
  text: z.string().describe('Quotes what was said or the card; never lists legal plays or suggests one'),
  about: z.array(StatementId).min(1),
  options: z.array(z.string()).optional().describe('Possible readings of what was said, for chooseOption and whichStep'),
});

export const InterpretedTimeline = z.object({
  entries: z.array(TimelineEntry),
  questions: z.array(InterpretedQuestion),
});

export type InterpretedGameAction = z.infer<typeof InterpretedGameAction>;
export type CardRef = z.infer<typeof CardRef>;
export type TimelineEntry = z.infer<typeof TimelineEntry>;
export type InterpretedQuestion = z.infer<typeof InterpretedQuestion>;
export type InterpretedTimeline = z.infer<typeof InterpretedTimeline>;

/** The JSON Schema handed to providers for structured output (ADR 0037). */
export function interpretedTimelineJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(InterpretedTimeline) as Record<string, unknown>;
}
