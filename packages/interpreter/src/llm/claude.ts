import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOf, LlmOutputError, parseOutput, type LlmProvider, type LlmRequest, type LlmResult } from './provider.js';

export interface ClaudeOptions {
  apiKey: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  fetch?: typeof fetch;
}

const TOOL = 'record_answer';

/**
 * The answer comes back as the input to a non-strict tool rather than through structured output: the
 * InterpretedTimeline schema compiles to a grammar larger than Claude's structured output accepts. Zod still checks
 * every answer.
 */
export function claudeProvider({ apiKey, model = 'claude-haiku-5-5', effort = 'low', fetch }: ClaudeOptions): LlmProvider {
  const client = new Anthropic({ apiKey, ...(fetch ? { fetch } : {}) });
  const id = `claude:${model}`;
  return {
    id,
    async complete<T>({ system, user, schema }: LlmRequest<T>): Promise<LlmResult<T>> {
      const started = Date.now();
      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        system: [{ type: 'text', text: `${system}\n\nGive your answer by calling the ${TOOL} tool.`, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        tools: [{ name: TOOL, description: 'Records your answer.', input_schema: jsonSchemaOf(schema) as Anthropic.Tool.InputSchema }],
        tool_choice: { type: 'auto' },
        output_config: { effort },
      });
      const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL);
      if (!call) {
        const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        throw new LlmOutputError(id, text, `no ${TOOL} call (stop_reason ${response.stop_reason})`);
      }
      const raw = JSON.stringify(call.input);
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
