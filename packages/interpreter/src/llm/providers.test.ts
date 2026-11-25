import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { claudeProvider } from './claude.js';
import { forGemini, geminiProvider } from './gemini.js';
import { LlmOutputError, LlmRequestError, retryInvalidOutput, type LlmProvider } from './provider.js';
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
  const message = (content: unknown[]) => ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content,
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 8 },
  });
  const answer = (input: unknown) => message([{ type: 'tool_use', id: 'tu_1', name: 'record_answer', input }]);

  it('offers the schema as a tool with a cacheable system prompt, and parses the tool input', async () => {
    const f = fakeFetch(answer({ answer: 4 }));
    const result = await claudeProvider({ apiKey: 'k', fetch: f.fn }).complete(request);
    expect(result).toMatchObject({ output: { answer: 4 }, raw: '{"answer":4}', model: 'claude-haiku-5-5', usage: { inputTokens: 120, outputTokens: 8 } });
    const body = f.calls[0]?.json;
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      system: [{ cache_control: { type: 'ephemeral' } }],
      tools: [{ name: 'record_answer', input_schema: { type: 'object' } }],
      output_config: { effort: 'low' },
    });
    expect(JSON.stringify(body?.system)).toContain('You add numbers.');
  });

  it("sends a game's card block as a second cached system block, and reports cache use (ADR 0121)", async () => {
    const reply = { ...answer({ answer: 4 }), usage: { input_tokens: 120, output_tokens: 8, cache_read_input_tokens: 30000, cache_creation_input_tokens: 0 } };
    const f = fakeFetch(reply);
    const result = await claudeProvider({ apiKey: 'k', fetch: f.fn }).complete({ ...request, context: 'Every card in this game.' });
    expect(f.calls[0]?.json.system).toEqual([
      { type: 'text', text: expect.stringContaining('You add numbers.'), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Every card in this game.', cache_control: { type: 'ephemeral' } },
    ]);
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 8, cacheReadTokens: 30000, cacheWriteTokens: 0 });
  });

  it('rejects tool input that does not match the schema', async () => {
    const f = fakeFetch(answer({ answer: 'four' }));
    await expect(claudeProvider({ apiKey: 'k', fetch: f.fn }).complete(request)).rejects.toBeInstanceOf(LlmOutputError);
  });

  it('reports an answer given as text instead of through the tool', async () => {
    const f = fakeFetch(message([{ type: 'text', text: 'It is 4.' }]));
    await expect(claudeProvider({ apiKey: 'k', fetch: f.fn }).complete(request)).rejects.toThrow('no record_answer call');
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

  it('rewrites oneOf and const, which Gemini ignores, as anyOf and enum', () => {
    const schema = { oneOf: [{ type: 'object', properties: { type: { const: 'tap' } } }, { properties: { type: { const: 'untap' } } }] };
    expect(forGemini(schema)).toEqual({ anyOf: [{ type: 'object', properties: { type: { enum: ['tap'] } } }, { properties: { type: { enum: ['untap'] } } }] });
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

describe('retryInvalidOutput', () => {
  const flaky = (answers: (() => unknown)[]): LlmProvider & { calls: number } => {
    const p = {
      id: 'fake:flaky',
      calls: 0,
      complete: async () => {
        const next = answers[p.calls++]!;
        return { output: next() as never, raw: '', model: 'flaky', usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 5 };
      },
    };
    return p;
  };
  const invalid = () => {
    throw new LlmOutputError('fake:flaky', '{"answer":"four"}', 'answer: expected number');
  };

  it('asks once more after an invalid answer', async () => {
    const p = flaky([invalid, () => ({ answer: 4 })]);
    expect((await retryInvalidOutput(p).complete(request)).output).toEqual({ answer: 4 });
    expect(p.calls).toBe(2);
  });

  it('gives up after the second invalid answer', async () => {
    const p = flaky([invalid, invalid]);
    await expect(retryInvalidOutput(p).complete(request)).rejects.toBeInstanceOf(LlmOutputError);
    expect(p.calls).toBe(2);
  });

  it('does not retry request failures', async () => {
    const p = flaky([
      () => {
        throw new LlmRequestError('fake:flaky', 500, 'down');
      },
    ]);
    await expect(retryInvalidOutput(p).complete(request)).rejects.toBeInstanceOf(LlmRequestError);
    expect(p.calls).toBe(1);
  });
});
