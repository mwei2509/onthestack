import { createGame, sealTurn, type CardDefinition, type GameState, type PlayerStatement, type Step } from '@onthestack/engine';
import { resolveTimeline, type PinnedEntry } from '../resolve.js';
import type { InterpretedQuestion, InterpretedTimeline, TimelineEntry } from '../schema.js';

/** An interpreter eval: a table and a turn's conversation in, the expected reading out (ADR 0015, 0039). */
export interface EvalCase {
  id: string;
  /** What the case is checking, for the report. */
  checks: string;
  turnStart: GameState;
  statements: PlayerStatement[];
  currentStep: Step;
  /** Actions tapped on the board this turn, already in the record (ADR 0065). */
  pinned?: PinnedEntry[];
  /** Questions players were shown after the last reading (ADR 0068). */
  openQuestions?: InterpretedQuestion[];
  expected: {
    entries: TimelineEntry[];
    /** Questions the interpreter should ask instead of guessing (ADR 0043). Matched on kind, player and statements. */
    questions?: Pick<InterpretedQuestion, 'kind' | 'askPlayer' | 'about'>[];
  };
}

const card = (name: string, types: string[], power?: number, toughness?: number, keywords: string[] = []): CardDefinition => ({
  name,
  types,
  ...(power !== undefined ? { power, toughness } : {}),
  keywords,
  abilities: [],
});

export const CARDS: Record<string, CardDefinition> = Object.fromEntries(
  [
    card('Plains', ['Land']),
    card('Island', ['Land']),
    card('Mountain', ['Land']),
    card('Swamp', ['Land']),
    card('Forest', ['Land']),
    card('Grizzly Bears', ['Creature'], 2, 2),
    card('Savannah Lions', ['Creature'], 2, 1),
    card('Serra Angel', ['Creature'], 4, 4, ['Flying', 'Vigilance']),
    card('Wall of Omens', ['Creature'], 0, 4, ['Defender']),
    card('Fencing Ace', ['Creature'], 1, 1, ['Double strike']),
    card('Raging Goblin', ['Creature'], 1, 1, ['Haste']),
    card('Giant Spider', ['Creature'], 2, 4, ['Reach']),
    card('Craterhoof Behemoth', ['Creature'], 5, 5, ['Haste', 'Trample']),
    card('Shock', ['Instant']),
    card('Lightning Bolt', ['Instant']),
    card('Murder', ['Instant']),
    card('Counterspell', ['Instant']),
    card('Giant Growth', ['Instant']),
    card('Fog', ['Instant']),
    card('Sol Ring', ['Artifact']),
    card('Teysa Karlov', ['Creature'], 2, 4),
    card('Krenko, Mob Boss', ['Creature'], 3, 3),
    card('Amalia Benavides Aguirre', ['Creature'], 2, 2),
    card("Sythis, Harvest's Hand", ['Enchantment', 'Creature'], 1, 2),
  ].map((c) => [c.name, c]),
);

const SEATS = [
  { id: 'theo', name: 'Theo', commander: 'Teysa Karlov' },
  { id: 'michael', name: 'Michael', commander: 'Krenko, Mob Boss' },
  { id: 'melissa', name: 'Melissa', commander: 'Amalia Benavides Aguirre' },
  { id: 'elena', name: 'Elena', commander: "Sythis, Harvest's Hand" },
];

/**
 * A four-player table on `active`'s turn, after the given earlier play. Setup entries use the same name-based
 * shape as the interpreter, so fixtures read like what was said.
 */
export function table(active: string, setup: TimelineEntry[] = []): GameState {
  const start = createGame(SEATS, CARDS);
  const resolved = resolveTimeline(start, { entries: setup, questions: [] });
  if (resolved.questions.length) throw new Error(`Fixture setup doesn't resolve: ${resolved.questions.map((q) => q.text).join('; ')}`);
  let next = sealTurn(start, resolved.timeline).nextTurnStart;
  while (next.turn.activePlayerId !== active) next = sealTurn(next, []).nextTurnStart;
  return next;
}

let setupStatement = 0;
/** One earlier action for `table`'s setup. */
export const before = (player: string, action: TimelineEntry['action']): TimelineEntry => ({ step: 'main1', player, action, from: [`setup${++setupStatement}`] });

/** Builds a case's statements with ids s1, s2, … and pressedAt in that order. */
export function conversation(...lines: [player: string, text: string][]): PlayerStatement[] {
  return lines.map(([playerId, text], i) => ({ id: `s${i + 1}`, playerId, pressedAt: `2026-11-22T20:00:${String(i).padStart(2, '0')}Z`, text }));
}

export const entry = (step: Step, player: string, action: TimelineEntry['action'], from: string[], response = false): TimelineEntry => ({
  step,
  player,
  action,
  from,
  ...(response ? { response } : {}),
});

/** A life change tapped on the board after the first `afterStatements` statements (ADR 0065). */
export const tappedLife = (step: Step, player: string, delta: number, afterStatements: number): PinnedEntry => ({
  entry: { step, playerId: player, gameAction: { type: 'life', playerId: player, delta }, from: [] },
  afterStatements,
});

/** How a case's tapped entries are placed among its statements, for resolving and scoring. */
export const resolveOptions = (c: Pick<EvalCase, 'pinned' | 'statements'>) => ({ pinned: c.pinned ?? [], statementIds: c.statements.map((s) => s.id) });

export type { InterpretedTimeline };
