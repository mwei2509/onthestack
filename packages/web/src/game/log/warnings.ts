import type { RulesWarning } from '@onthestack/engine';

/**
 * Places each RulesWarning under the statement whose entry raised it: the last of the entry's statements, as
 * entries are (ADR 0122). Warnings no statement raised, such as a possible loop or one from a tap, go at the top.
 */
export function placeWarnings(warnings: RulesWarning[], statementIds: string[]): { top: RulesWarning[]; byStatement: Map<string, RulesWarning[]> } {
  const order = new Map(statementIds.map((id, i) => [id, i]));
  const top: RulesWarning[] = [];
  const byStatement = new Map<string, RulesWarning[]>();
  for (const w of warnings) {
    const from = (w.entry?.from ?? []).filter((id) => order.has(id));
    if (from.length === 0) {
      top.push(w);
      continue;
    }
    const last = from.reduce((a, b) => (order.get(b)! > order.get(a)! ? b : a));
    byStatement.set(last, [...(byStatement.get(last) ?? []), w]);
  }
  return { top, byStatement };
}

/** Warnings still waiting for "Do it anyway". */
export const openWarnings = (warnings: RulesWarning[]) => warnings.filter((w) => !w.overriddenBy);
