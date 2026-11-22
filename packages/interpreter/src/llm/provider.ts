import { z } from 'zod';

/** One request: a prompt, and the shape the answer must take (ADR 0037, 0041). */
export interface LlmRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

export interface LlmResult<T> {
  output: T;
  /** The response text as the provider returned it, kept so it can be recorded and replayed. */
  raw: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export interface LlmProvider {
  /** Provider and model, e.g. "claude:claude-haiku-5-5". */
  readonly id: string;
  complete<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}

/** The provider answered, but not in the required shape. */
export class LlmOutputError extends Error {
  constructor(
    readonly providerId: string,
    readonly raw: string,
    readonly issues: string,
  ) {
    super(`${providerId} returned output that doesn't match the schema: ${issues}`);
  }
}

export class LlmRequestError extends Error {
  constructor(
    readonly providerId: string,
    readonly status: number,
    body: string,
  ) {
    super(`${providerId} request failed (${status}): ${body.slice(0, 500)}`);
  }
}

export function parseOutput<T>(providerId: string, schema: z.ZodType<T>, raw: string): T {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new LlmOutputError(providerId, raw, 'not valid JSON');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new LlmOutputError(providerId, raw, z.prettifyError(parsed.error));
  return parsed.data;
}

export const jsonSchemaOf = (schema: z.ZodType): Record<string, unknown> => z.toJSONSchema(schema) as Record<string, unknown>;
