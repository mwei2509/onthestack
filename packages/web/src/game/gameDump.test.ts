import { describe, expect, it } from 'vitest';
import { readGameDump } from './gameDump.js';

const answering = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('readGameDump (ADR 0130)', () => {
  it('returns the dump as indented JSON', async () => {
    expect(await readGameDump('KITE-MOSS-42', answering(200, '{"code":"KITE-MOSS-42","version":3}'))).toEqual({
      json: '{\n  "code": "KITE-MOSS-42",\n  "version": 3\n}',
    });
  });

  it("passes on the server's refusal, as production does without DEBUG_TOKEN", async () => {
    expect(await readGameDump('KITE-MOSS-42', answering(403, 'Set the DEBUG_TOKEN secret to read game dumps here'))).toEqual({
      error: '403: Set the DEBUG_TOKEN secret to read game dumps here',
    });
  });
});
