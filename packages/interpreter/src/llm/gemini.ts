import { jsonSchemaOf, LlmRequestError, parseOutput, type LlmProvider, type LlmRequest, type LlmResult } from './provider.js';

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export function geminiProvider({ apiKey, model = 'gemini-3.5-flash-lite', fetch: doFetch = fetch }: GeminiOptions): LlmProvider {
  const id = `gemini:${model}`;
  return {
    id,
    async complete<T>({ system: base, context, user, schema }: LlmRequest<T>): Promise<LlmResult<T>> {
      const system = context ? `${base}\n\n${context}` : base;
      const started = Date.now();
      const response = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json', responseJsonSchema: forGemini(jsonSchemaOf(schema)) },
        }),
      });
      if (!response.ok) throw new LlmRequestError(id, response.status, await response.text());
      const body = (await response.json()) as GenerateContentResponse;
      const raw = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return {
        output: parseOutput(id, schema, raw),
        raw,
        model,
        usage: { inputTokens: body.usageMetadata?.promptTokenCount ?? 0, outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0 },
        latencyMs: Date.now() - started,
      };
    },
  };
}

/**
 * Gemini's JSON Schema support has no `oneOf` or `const`, and it ignores what it doesn't support rather than
 * rejecting it, which left action types unconstrained. A discriminated union's branches never overlap, so `anyOf`
 * means the same here, and `const` is a one-value `enum`.
 */
export function forGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forGemini);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'oneOf') out.anyOf = forGemini(value);
    else if (key === 'const') out.enum = [value];
    else out[key] = forGemini(value);
  }
  return out;
}
