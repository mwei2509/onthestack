import { retryInvalidOutput, type LlmProvider, type LlmResult } from './llm/provider.js';
import { buildPrompt, type PromptInput } from './prompt.js';
import { InterpretedTimeline } from './schema.js';

/** Reads the whole turn so far into an InterpretedTimeline, the way games and the evals both call providers. */
export function interpretTurn(provider: LlmProvider, input: PromptInput): Promise<LlmResult<InterpretedTimeline>> {
  return retryInvalidOutput(provider).complete({ ...buildPrompt(input), schema: InterpretedTimeline });
}
