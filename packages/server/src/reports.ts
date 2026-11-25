/** Reports keep their dump in one D1 row, which tops out around 2 MB, so leave plenty of room (ADR 0118). */
export const MAX_DUMP_BYTES = 1_000_000;

interface Interpretation {
  user?: string;
  answer?: string;
}

/**
 * The dump as JSON, under `limit` bytes: the oldest interpretations lose their prompts first, then their answers.
 * Everything else is kept, since the turns and the board are what a report is about.
 */
export function fitDump(dump: { interpretations?: Interpretation[] } & Record<string, unknown>, limit = MAX_DUMP_BYTES): { json: string; trimmed: boolean } {
  const size = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
  if (size(dump) <= limit) return { json: JSON.stringify(dump), trimmed: false };
  const interpretations = (dump.interpretations ?? []).map((r) => ({ ...r }));
  const fitted = { ...dump, interpretations };
  for (const field of ['user', 'answer'] as const) {
    for (const r of interpretations) {
      if (size(fitted) <= limit) return { json: JSON.stringify(fitted), trimmed: true };
      if (r[field] !== undefined) r[field] = '(trimmed to fit the report)';
    }
  }
  return { json: JSON.stringify(fitted), trimmed: true };
}
