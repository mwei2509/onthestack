import { jsonSchemaOf, LlmRequestError, parseOutput, type LlmProvider, type LlmRequest, type LlmResult } from './provider.js';

export interface WorkersAiOptions {
  accountId: string;
  apiToken: string;
  model?: string;
  fetch?: typeof fetch;
}

interface RunResponse {
  success: boolean;
  errors?: { message: string }[];
  result?: { response?: unknown; usage?: { prompt_tokens?: number; completion_tokens?: number } };
}

/** Workers AI over its REST API, which works from evals on a laptop as well as from the Worker. */
export function workersAiProvider({ accountId, apiToken, model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast', fetch: doFetch = fetch }: WorkersAiOptions): LlmProvider {
  const id = `workers-ai:${model}`;
  return {
    id,
    async complete<T>({ system: base, context, user, schema }: LlmRequest<T>): Promise<LlmResult<T>> {
      const system = context ? `${base}\n\n${context}` : base;
      const started = Date.now();
      const response = await doFetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_schema', json_schema: jsonSchemaOf(schema) },
        }),
      });
      if (!response.ok) throw new LlmRequestError(id, response.status, await response.text());
      const body = (await response.json()) as RunResponse;
      if (!body.success) throw new LlmRequestError(id, response.status, body.errors?.map((e) => e.message).join('; ') ?? 'unknown error');
      // JSON mode returns the object already parsed; other models return text.
      const answer = body.result?.response;
      const raw = typeof answer === 'string' ? answer : JSON.stringify(answer ?? null);
      return {
        output: parseOutput(id, schema, raw),
        raw,
        model,
        usage: { inputTokens: body.result?.usage?.prompt_tokens ?? 0, outputTokens: body.result?.usage?.completion_tokens ?? 0 },
        latencyMs: Date.now() - started,
      };
    },
  };
}
