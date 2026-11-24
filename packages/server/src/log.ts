import type { ReplayResult } from '@onthestack/engine';
import type { ResolvedTimeline } from '@onthestack/interpreter';

/** What a replay produced, as one log line can carry it (ADR 0116): enough to see a board that doesn't match the table. */
export function replaySummary(resolved: ResolvedTimeline, board: ReplayResult) {
  const { state } = board;
  return {
    entries: resolved.timeline.length,
    questions: resolved.questions.map((q) => `${q.kind} to ${q.askPlayer}: ${q.text}`),
    warnings: board.warnings.map((w) => `${w.code}: ${w.message}`),
    events: board.events.length,
    battlefield: Object.values(state.permanents).map((p) => `${p.card} (${p.controllerId}${p.tapped ? ', tapped' : ''})`),
    stack: state.stack.map((k) => `${k.source.card} (${k.controllerId}, ${k.status})`),
    life: Object.fromEntries(Object.values(state.players).map((p) => [p.id, p.life])),
  };
}
