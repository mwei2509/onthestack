import { createGame } from '@onthestack/engine';
import { describe, expect, it } from 'vitest';
import { interpretTurn } from './interpret.js';
import type { LlmProvider, LlmRequest } from './llm/provider.js';
import { parseOutput } from './llm/provider.js';

const turnStart = createGame([
  { id: 'p1', name: 'Theo' },
  { id: 'p2', name: 'Elena' },
]);
const statements = [{ id: 's1', playerId: 'p1', pressedAt: '2026-11-24T20:00:00.000Z', text: 'Elena loses 3 life' }];
const answer = { entries: [{ step: 'upkeep', player: 'p1', action: { type: 'life', player: 'p2', delta: -3 }, from: ['s1'] }], questions: [] };

function answering(...raws: string[]): LlmProvider & { requests: LlmRequest<unknown>[] } {
  const requests: LlmRequest<unknown>[] = [];
  return {
    id: 'fake',
    requests,
    async complete<T>(request: LlmRequest<T>) {
      requests.push(request as LlmRequest<unknown>);
      const raw = raws[requests.length - 1]!;
      return { output: parseOutput('fake', request.schema, raw), raw, model: 'fake', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 };
    },
  };
}

describe('interpretTurn', () => {
  it('sends the whole turn and returns the validated timeline', async () => {
    const provider = answering(JSON.stringify(answer));
    const result = await interpretTurn(provider, { turnStart, statements, currentStep: 'upkeep' });
    expect(result.output).toEqual(answer);
    expect(provider.requests[0]!.user).toContain('[s1] Theo (p1): "Elena loses 3 life"');
  });

  it('asks once more when the first answer is malformed (ADR 0046)', async () => {
    const provider = answering('{"entries": "nope"}', JSON.stringify(answer));
    expect((await interpretTurn(provider, { turnStart, statements, currentStep: 'upkeep' })).output).toEqual(answer);
    expect(provider.requests).toHaveLength(2);
  });
});
