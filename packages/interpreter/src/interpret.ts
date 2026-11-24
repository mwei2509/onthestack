import { retryInvalidOutput, type LlmProvider, type LlmResult } from './llm/provider.js';
import { buildPrompt, type Prompt, type PromptInput } from './prompt.js';
import { InterpretedTimeline } from './schema.js';

/** Sends a built prompt the way games and the evals both call providers, with ADR 0046's one retry. */
export function interpretPrompt(provider: LlmProvider, prompt: Prompt): Promise<LlmResult<InterpretedTimeline>> {
  return retryInvalidOutput(provider).complete({ system: prompt.system, user: prompt.user, schema: InterpretedTimeline });
}

/** Reads the whole turn so far into an InterpretedTimeline. */
export function interpretTurn(provider: LlmProvider, input: PromptInput): Promise<LlmResult<InterpretedTimeline>> {
  return interpretPrompt(provider, buildPrompt(input));
}
