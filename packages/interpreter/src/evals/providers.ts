import { claudeProvider } from '../llm/claude.js';
import { geminiProvider } from '../llm/gemini.js';
import type { LlmProvider } from '../llm/provider.js';
import { workersAiProvider } from '../llm/workers-ai.js';

/** Dollars per million tokens. Free tiers are 0; ADR 0040. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude:claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

export const costOf = (providerId: string, usage: { inputTokens: number; outputTokens: number }) => {
  const price = PRICES[providerId] ?? { input: 0, output: 0 };
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
};

/**
 * The providers to evaluate, from the environment. EVAL_PROVIDERS picks some ("claude,gemini"); by default every
 * provider whose key is set. EVAL_MODEL_WORKERS_AI, EVAL_MODEL_GEMINI and EVAL_MODEL_CLAUDE override the model.
 */
export function providersFromEnv(env: Record<string, string | undefined>): LlmProvider[] {
  const wanted = env.EVAL_PROVIDERS?.split(',').map((s) => s.trim());
  const pick = (name: string, ready: boolean) => ready && (!wanted || wanted.includes(name));
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
