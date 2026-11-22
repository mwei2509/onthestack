import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { claudeProvider } from './claude.js';
import { geminiProvider } from './gemini.js';
import { LlmOutputError, LlmRequestError, type LlmProvider } from './provider.js';
import { recordedProvider, recordingProvider, type Recording } from './recorded.js';
import { workersAiProvider } from './workers-ai.js';

const schema = z.object({ answer: z.number() });
const request = { system: 'You add numbers.', user: '2 + 2?', schema };

/** A fake fetch that records the request and answers with the given JSON. */
function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit; json: Record<string, unknown> }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, json: JSON.parse(String(init?.body ?? '{}')) });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fn, calls };
}

describe('claudeProvider', () => {
  const message = (text: string) => ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 8 },
  });

  it('asks for structured output with a cacheable system prompt, and parses the answer', async () => {
    const f = fakeFetch(message('{"answer":4}'));
    const result = await claudeProvider({ apiKey: 'k', fetch: f.fn }).complete(request);
    expect(result).toMatchObject({ output: { answer: 4 }, model: 'claude-haiku-5-5', usage: { inputTokens: 120, outputTokens: 8 } });
    const body = f.calls[0]?.json;
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', system: [{ text: 'You add numbers.', cache_control: { type: 'ephemeral' } }], output_config: { effort: 'low' } });
    expect(body?.output_config).toHaveProperty('format.schema');
  });

  it('rejects an answer that does not match the schema', async () => {
    const f = fakeFetch(message('{"answer":"four"}'));
    await expect(claudeProvider({ apiKey: 'k', fetch: f.fn }).complete(request)).rejects.toThrow();
  });
});

describe('geminiProvider', () => {
  it('sends the system instruction and JSON Schema, and reads the text and usage', async () => {
    const f = fakeFetch({ candidates: [{ content: { parts: [{ text: '{"answer":' }, { text: '4}' }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 4 } });
    const result = await geminiProvider({ apiKey: 'g', model: 'gemini-3.5-flash-lite', fetch: f.fn }).complete(request);
    expect(result).toMatchObject({ output: { answer: 4 }, usage: { inputTokens: 50, outputTokens: 4 } });
    const call = f.calls[0];
    expect(call?.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect((call?.init.headers as Record<string, string>)['x-goog-api-key']).toBe('g');
    expect(call?.json).toMatchObject({
      systemInstruction: { parts: [{ text: 'You add numbers.' }] },
      contents: [{ role: 'user', parts: [{ text: '2 + 2?' }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } },
    });
  });

  it('reports an HTTP failure with its status', async () => {
    const f = fakeFetch({ error: 'quota' }, 429);
    await expect(geminiProvider({ apiKey: 'g', fetch: f.fn }).complete(request)).rejects.toBeInstanceOf(LlmRequestError);
  });

  it('reports output that is not JSON', async () => {
    const f = fakeFetch({ candidates: [{ content: { parts: [{ text: 'four' }] } }] });
    await expect(geminiProvider({ apiKey: 'g', fetch: f.fn }).complete(request)).rejects.toBeInstanceOf(LlmOutputError);
  });
});

describe('workersAiProvider', () => {
  it('sends messages with a JSON-schema response format and accepts an already-parsed answer', async () => {
    const f = fakeFetch({ success: true, result: { response: { answer: 4 }, usage: { prompt_tokens: 30, completion_tokens: 3 } } });
    const result = await workersAiProvider({ accountId: 'acct', apiToken: 't', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', fetch: f.fn }).complete(request);
    expect(result).toMatchObject({ output: { answer: 4 }, raw: '{"answer":4}', usage: { inputTokens: 30, outputTokens: 3 } });
    const call = f.calls[0];
    expect(call?.url).toBe('https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    expect(call?.json).toMatchObject({
      messages: [
        { role: 'system', content: 'You add numbers.' },
        { role: 'user', content: '2 + 2?' },
      ],
      response_format: { type: 'json_schema', json_schema: { type: 'object' } },
    });
  });

  it('accepts a text answer too', async () => {
    const f = fakeFetch({ success: true, result: { response: '{"answer":4}' } });
    const result = await workersAiProvider({ accountId: 'a', apiToken: 't', fetch: f.fn }).complete(request);
    expect(result.output).toEqual({ answer: 4 });
  });

  it("reports Workers AI's own errors, such as JSON mode not being met", async () => {
    const f = fakeFetch({ success: false, errors: [{ message: "JSON Mode couldn't be met" }] });
    await expect(workersAiProvider({ accountId: 'a', apiToken: 't', fetch: f.fn }).complete(request)).rejects.toThrow("JSON Mode couldn't be met");
  });
});

describe('recording and replaying', () => {
  it('replays what a live provider returned, without the network', async () => {
    const live: LlmProvider = {
      id: 'fake:live',
      complete: async () => ({ output: { answer: 4 } as never, raw: '{"answer":4}', model: 'live', usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 700 }),
    };
    const saved: Recording[] = [];
    await recordingProvider(live, (r) => saved.push(r)).complete(request);
    expect(saved).toEqual([expect.objectContaining({ providerId: 'fake:live', system: request.system, user: request.user, raw: '{"answer":4}' })]);

    const replayed = await recordedProvider(saved).complete(request);
    expect(replayed).toMatchObject({ output: { answer: 4 }, latencyMs: 700 });
    await expect(recordedProvider(saved).complete({ ...request, user: '3 + 3?' })).rejects.toThrow('no recorded response');
  });
});
