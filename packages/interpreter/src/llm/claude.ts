import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { parseOutput, type LlmProvider, type LlmRequest, type LlmResult } from './provider.js';

export interface ClaudeOptions {
  apiKey: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  fetch?: typeof fetch;
}

export function claudeProvider({ apiKey, model = 'claude-haiku-5-5', effort = 'low', fetch }: ClaudeOptions): LlmProvider {
  const client = new Anthropic({ apiKey, ...(fetch ? { fetch } : {}) });
  const id = `claude:${model}`;
  return {
    id,
    async complete<T>({ system, user, schema }: LlmRequest<T>): Promise<LlmResult<T>> {
      const started = Date.now();
      const response = await client.messages.parse({
        model,
        max_tokens: 16000,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        output_config: { effort, format: zodOutputFormat(schema) },
      });
      const raw = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return {
        output: parseOutput(id, schema, raw),
        raw,
        model,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        latencyMs: Date.now() - started,
      };
    },
  };
}
