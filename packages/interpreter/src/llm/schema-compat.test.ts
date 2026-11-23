import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { describe, expect, it } from 'vitest';
import { InterpretedTimeline } from '../schema.js';

describe('the InterpretedTimeline schema with providers', () => {
  it("converts to Claude's structured-output format, recursion included", () => {
    const format = zodOutputFormat(InterpretedTimeline);
    expect(JSON.stringify(format.schema)).toContain('"effects"');
  });
});
