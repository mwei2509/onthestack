import { parseOutput, type LlmProvider, type LlmRequest, type LlmResult } from './provider.js';

export interface Recording {
  providerId: string;
  model: string;
  system: string;
  context?: string;
  user: string;
  raw: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

/** Replays saved responses, so tests and CI run without a network or a key (ADR 0041, 0042). */
export function recordedProvider(recordings: Recording[], id = 'recorded'): LlmProvider {
  return {
    id,
    async complete<T>({ system, context, user, schema }: LlmRequest<T>): Promise<LlmResult<T>> {
      const hit = recordings.find((r) => r.system === system && (r.context ?? '') === (context ?? '') && r.user === user);
      if (!hit) throw new Error(`${id}: no recorded response for this prompt`);
      return { output: parseOutput(hit.providerId, schema, hit.raw), raw: hit.raw, model: hit.model, usage: hit.usage, latencyMs: hit.latencyMs };
    },
  };
}

/** Passes requests to a live provider and hands each response to `save`, for replay later. */
export function recordingProvider(inner: LlmProvider, save: (recording: Recording) => void): LlmProvider {
  return {
    id: inner.id,
    async complete<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      const result = await inner.complete(request);
      save({
        providerId: inner.id,
        model: result.model,
        system: request.system,
        ...(request.context ? { context: request.context } : {}),
        user: request.user,
        raw: result.raw,
        usage: result.usage,
        latencyMs: result.latencyMs,
      });
      return result;
    },
  };
}
