import type { RulesWarning, TableView } from '@onthestack/engine';

type PlayerTask = TableView['playerTasks'][number];

/**
 * Places each item under the statement it came from: the last of its statements, as entries are. Items no current
 * statement set off go at the top.
 */
function placeByStatement<T>(items: T[], fromOf: (item: T) => string[], statementIds: string[]): { top: T[]; byStatement: Map<string, T[]> } {
  const order = new Map(statementIds.map((id, i) => [id, i]));
  const top: T[] = [];
  const byStatement = new Map<string, T[]>();
  for (const item of items) {
    const from = fromOf(item).filter((id) => order.has(id));
    if (from.length === 0) {
      top.push(item);
      continue;
    }
    const last = from.reduce((a, b) => (order.get(b)! > order.get(a)! ? b : a));
    byStatement.set(last, [...(byStatement.get(last) ?? []), item]);
  }
  return { top, byStatement };
}

/** RulesWarnings under the statement whose entry raised them; a possible loop or a tap's warning at the top (ADR 0122). */
export const placeWarnings = (warnings: RulesWarning[], statementIds: string[]) => placeByStatement(warnings, (w) => w.entry?.from ?? [], statementIds);

/** PlayerTasks under the statement that set them off (ADR 0125). */
export const placeTasks = (tasks: PlayerTask[], statementIds: string[]) => placeByStatement(tasks, (t) => t.from, statementIds);

/** Warnings still waiting for "Do it anyway". */
export const openWarnings = (warnings: RulesWarning[]) => warnings.filter((w) => !w.overriddenBy);

/** PlayerTasks nobody has marked done. */
export const undoneTasks = (tasks: PlayerTask[]) => tasks.filter((t) => !t.doneBy);
