import { replayTurn, STEPS, type GameState, type ReplayResult, type Step } from '@onthestack/engine';
import { resolveTimeline } from '../resolve.js';
import type { InterpretedQuestion, InterpretedTimeline, TimelineEntry } from '../schema.js';
import { resolveOptions, type EvalCase } from './case.js';

export interface EvalScore {
  pass: boolean;
  /** Parts of the game that came out differently, expected against actual. */
  outcome: { part: string; expected: unknown; actual: unknown }[];
  /** Questions the case expected that weren't asked: the model guessed or ignored the ambiguity. */
  guessed: ExpectedQuestion[];
  /** Questions asked that the case didn't expect: the board or conversation already settled them. */
  overAsked: InterpretedQuestion[];
  /** The two readings side by side, for debugging; not part of pass or fail. */
  entries: { expected: string[]; actual: string[] };
}

type ExpectedQuestion = NonNullable<EvalCase['expected']['questions']>[number];

/** ADR 0039: a case passes when both readings replay to the same game and the same questions were asked. */
export function scoreCase(c: EvalCase, actual: InterpretedTimeline): EvalScore {
  const expected = resolveTimeline(c.turnStart, { entries: c.expected.entries, questions: [] }, resolveOptions(c));
  const got = resolveTimeline(c.turnStart, actual, resolveOptions(c));
  // Statements can move the table forward (ADR 0066), so both readings replay as far as either reaches.
  const upTo = [...expected.timeline, ...got.timeline].reduce<Step>((s, e) => (STEPS.indexOf(e.step) > STEPS.indexOf(s) ? e.step : s), c.currentStep);
  const want = summarize(replayTurn(c.turnStart, expected.timeline, { currentStep: upTo }));
  const have = summarize(replayTurn(c.turnStart, got.timeline, { currentStep: upTo }));

  const outcome = Object.keys(want)
    .filter((part) => JSON.stringify(want[part]) !== JSON.stringify(have[part]))
    .map((part) => ({ part, expected: want[part], actual: have[part] }));

  const expectedQuestions = c.expected.questions ?? [];
  const guessed = expectedQuestions.filter((q) => !got.questions.some((a) => sameQuestion(q, a)));
  const overAsked = got.questions.filter((a) => !expectedQuestions.some((q) => sameQuestion(q, a)));

  return {
    pass: outcome.length === 0 && guessed.length === 0 && overAsked.length === 0,
    outcome,
    guessed,
    overAsked,
    entries: { expected: c.expected.entries.map(describe), actual: actual.entries.map(describe) },
  };
}

/** Same kind, same player, and about at least one of the same statements. */
const sameQuestion = (q: ExpectedQuestion, a: InterpretedQuestion) => q.kind === a.kind && q.askPlayer === a.askPlayer && q.about.some((s) => a.about.includes(s));

const describe = (e: TimelineEntry) => `${e.step} ${e.player}${e.response ? ' (response)' : ''}: ${JSON.stringify(e.action)} from ${e.from.join(',')}`;

/** The game in terms players can see, with engine IDs replaced by card names so equivalent readings compare equal. */
function summarize({ state, warnings }: ReplayResult): Record<string, unknown> {
  const name = (id: string) => nameOf(state, id);
  return {
    players: Object.fromEntries(Object.values(state.players).map((p) => [p.id, { life: p.life, poison: p.poison, commanderDamage: p.commanderDamage, out: p.out }])),
    permanents: Object.values(state.permanents)
      .map((p) =>
        JSON.stringify({
          card: p.card,
          controller: p.controllerId,
          owner: p.ownerId,
          tapped: p.tapped,
          damage: p.damage,
          counters: p.counters,
          token: p.isToken,
          effects: p.effects.map((e) => ({ kind: e.kind, power: e.power, toughness: e.toughness, keywords: e.keywords?.length ? e.keywords : undefined, until: e.until })),
        }),
      )
      .sort(),
    graveyards: Object.fromEntries(Object.entries(state.graveyards).map(([id, cards]) => [id, [...cards].sort()])),
    exile: state.exile.map((e) => `${e.card}|${e.ownerId}`).sort(),
    commandZone: state.commandZone,
    stack: state.stack.map((k) => `${k.source.card}|${k.controllerId}|${k.status}`),
    combat: state.combat && {
      attacks: state.combat.attacks.map((a) => `${name(a.attackerId)} -> ${a.target}`).sort(),
      blocks: state.combat.blocks.map((b) => `${name(b.blockerId)} blocks ${name(b.attackerId)}`).sort(),
      ready: [...state.combat.ready].sort(),
      divisions: Object.entries(state.combat.divisions)
        .map(([attacker, split]) => `${name(attacker)}: ${Object.entries(split).map(([to, n]) => `${name(to)}=${n}`).sort().join(',')}`)
        .sort(),
    },
    warnings: warnings.map((w) => w.code).sort(),
  };
}

function nameOf(state: GameState, id: string): string {
  const p = state.permanents[id];
  if (p) return `${p.card}@${p.controllerId}`;
  if (state.players[id]) return id;
  return id;
}
