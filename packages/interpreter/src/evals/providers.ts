import { claudeProvider } from '../llm/claude.js';
import { geminiProvider } from '../llm/gemini.js';
import type { LlmProvider } from '../llm/provider.js';
import { workersAiProvider } from '../llm/workers-ai.js';

/** Dollars per million tokens. Free tiers are 0; ADR 0040. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude:claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

/** Cache reads cost a tenth of the input price, and five-minute cache writes 1.25 times it. */
export const costOf = (providerId: string, usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }) => {
  const price = PRICES[providerId] ?? { input: 0, output: 0 };
  const input = usage.inputTokens + 0.1 * (usage.cacheReadTokens ?? 0) + 1.25 * (usage.cacheWriteTokens ?? 0);
  return (input * price.input + usage.outputTokens * price.output) / 1_000_000;
};

/**
 * The providers to evaluate, from the environment. EVAL_PROVIDERS picks some ("claude,gemini"); unset or empty means every
 * provider whose key is set. EVAL_MODEL_WORKERS_AI, EVAL_MODEL_GEMINI and EVAL_MODEL_CLAUDE override the model.
 */
export function providersFromEnv(env: Record<string, string | undefined>): LlmProvider[] {
  const wanted = (env.EVAL_PROVIDERS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const pick = (name: string, ready: boolean) => ready && (wanted.length === 0 || wanted.includes(name));
  const providers: LlmProvider[] = [];
  if (pick('workers-ai', !!env.CLOUDFLARE_ACCOUNT_ID && !!env.CLOUDFLARE_API_TOKEN)) {
    const model = env.EVAL_MODEL_WORKERS_AI;
    providers.push(workersAiProvider({ accountId: env.CLOUDFLARE_ACCOUNT_ID!, apiToken: env.CLOUDFLARE_API_TOKEN!, ...(model ? { model } : {}) }));
  }
  if (pick('gemini', !!env.GEMINI_API_KEY)) {
    const model = env.EVAL_MODEL_GEMINI;
    providers.push(geminiProvider({ apiKey: env.GEMINI_API_KEY!, ...(model ? { model } : {}) }));
  }
  if (pick('claude', !!env.ANTHROPIC_API_KEY)) {
    const model = env.EVAL_MODEL_CLAUDE;
    providers.push(claudeProvider({ apiKey: env.ANTHROPIC_API_KEY!, ...(model ? { model } : {}) }));
  }
  return providers;
}
