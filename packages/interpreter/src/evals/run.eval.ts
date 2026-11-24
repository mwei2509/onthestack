import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { LlmOutputError, LlmRequestError, retryInvalidOutput, type LlmProvider, type LlmRequest, type LlmResult } from '../llm/provider.js';
import { recordingProvider, type Recording } from '../llm/recorded.js';
import { buildPrompt } from '../prompt.js';
import { InterpretedTimeline } from '../schema.js';
import { CASES } from './cases/index.js';
import { costOf, providersFromEnv } from './providers.js';
import { scoreCase } from './score.js';

interface Row {
  provider: string;
  caseId: string;
  pass: boolean;
  latencyMs: number;
  cost: number;
  failure?: string;
}

const providers = providersFromEnv(process.env);
const rows: Row[] = [];
const recordings: Record<string, Recording[]> = {};

if (providers.length === 0) {
  it.skip('no provider keys set: see packages/interpreter/README.md', () => {});
}

describe.each(providers.map((p) => [p.id, p] as const))('%s', (providerId, live) => {
  // Evals call providers the way games will, including the retry on an invalid answer.
  const recorded = process.env.EVAL_RECORD ? recordingProvider(live, (r) => (recordings[providerId] ??= []).push(r)) : live;
  const provider = retryInvalidOutput(recorded);

  it.each(CASES.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const prompt = buildPrompt({ turnStart: c.turnStart, statements: c.statements, currentStep: c.currentStep, pinned: c.pinned, openQuestions: c.openQuestions });
    const started = Date.now();
    let result;
    try {
      result = await withRetries(provider, { ...prompt, schema: InterpretedTimeline });
    } catch (e) {
      const raw = e instanceof LlmOutputError ? `\n\nThe model returned:\n${e.raw.slice(0, 4000)}` : '';
      rows.push({ provider: providerId, caseId: c.id, pass: false, latencyMs: Date.now() - started, cost: 0, failure: `${String(e)}${raw}` });
      throw e;
    }
    const score = scoreCase(c, result.output);
    const failure = score.pass ? undefined : JSON.stringify({ outcome: score.outcome, guessed: score.guessed, overAsked: score.overAsked, entries: score.entries }, null, 2);
    rows.push({ provider: providerId, caseId: c.id, pass: score.pass, latencyMs: result.latencyMs, cost: costOf(providerId, result.usage), ...(failure ? { failure } : {}) });
    expect(score.pass, `${c.checks}\n${failure}`).toBe(true);
  });
});

/** Free tiers limit requests per minute; wait and retry rather than count a rate limit as a failed case. */
async function withRetries<T>(provider: LlmProvider, request: LlmRequest<T>): Promise<LlmResult<T>> {
  for (const waitSeconds of [15, 30, 60]) {
    try {
      return await provider.complete(request);
    } catch (e) {
      if (!(e instanceof LlmRequestError && e.status === 429)) throw e;
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }
  }
  return provider.complete(request);
}

afterAll(() => {
  if (rows.length === 0) return;
  const report = summary(rows);
  console.log(`\n${report}`);
  mkdirSync('eval-results', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const failures = rows.filter((r) => !r.pass).map((r) => `### ${r.provider} / ${r.caseId}\n\n\`\`\`\n${r.failure}\n\`\`\``);
  writeFileSync(`eval-results/${stamp}.md`, `${report}\n\n## Failures\n\n${failures.join('\n\n')}\n`);
  for (const [id, recs] of Object.entries(recordings)) {
    writeFileSync(`eval-results/${stamp}-${id.replace(/[^a-z0-9.-]/gi, '_')}.json`, JSON.stringify(recs, null, 2));
  }
});

function summary(all: Row[]): string {
  const lines = ['| Provider | Passed | Median latency | Cost per case | Cost per run |', '| --- | --- | --- | --- | --- |'];
  for (const id of [...new Set(all.map((r) => r.provider))]) {
    const mine = all.filter((r) => r.provider === id);
    const latencies = mine.map((r) => r.latencyMs).sort((a, b) => a - b);
    const cost = mine.reduce((s, r) => s + r.cost, 0);
    lines.push(`| ${id} | ${mine.filter((r) => r.pass).length}/${mine.length} | ${latencies[Math.floor(latencies.length / 2)]} ms | $${(cost / mine.length).toFixed(5)} | $${cost.toFixed(4)} |`);
  }
  return lines.join('\n');
}
