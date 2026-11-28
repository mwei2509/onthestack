import { applyAction, createGame, settle, type CardDefinition } from '@onthestack/engine';
import { describe, expect, it } from 'vitest';
import { parseOutput, type LlmProvider, type LlmRequest, type LlmResult } from '../llm/provider.js';
import { EXAMPLES } from './examples.js';
import { TRANSLATE_SYSTEM } from './prompt.js';
import { TranslationDraft } from './schema.js';
import { abilitySlug, draftTranslation, toTranslation } from './translate.js';

/** Answers every request with the given raw responses in turn, and counts the calls. */
function scripted(...raws: string[]): LlmProvider & { calls: LlmRequest<unknown>[] } {
  const calls: LlmRequest<unknown>[] = [];
  return {
    id: 'scripted',
    calls,
    async complete<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      calls.push(request as LlmRequest<unknown>);
      const raw = raws[Math.min(calls.length - 1, raws.length - 1)]!;
      return { output: parseOutput('scripted', request.schema, raw), raw, model: 'scripted', usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 0 };
    },
  };
}

const example = (name: string) => EXAMPLES.find((e) => e.card.name === name)!;

describe('drafting examples', () => {
  it.each(EXAMPLES.map((e) => [e.card.name, e] as const))('%s validates and converts with no problems', (_name, e) => {
    expect(TranslationDraft.safeParse(e.draft).success).toBe(true);
    expect(toTranslation(e.card.name, e.draft).problems).toEqual([]);
  });

  it('every example is in the system prompt', () => {
    for (const e of EXAMPLES) expect(TRANSLATE_SYSTEM).toContain(JSON.stringify(e.draft));
  });
});

describe('toTranslation', () => {
  it('numbers abilities from the card name and drops the Oracle sentence from modelled ones', () => {
    const { abilities } = toTranslation('Authority of the Consuls', example('Authority of the Consuls').draft);
    expect(abilities.map((a) => a.id)).toEqual(['authority-of-the-consuls#1', 'authority-of-the-consuls#2']);
    expect(abilities[1]).not.toHaveProperty('text');
  });

  it('an always-on effect becomes a static Oracle reminder with its when', () => {
    expect(toTranslation('Cleric Class', example('Cleric Class').draft).abilities[0]).toEqual({
      id: 'cleric-class#1',
      kind: 'static',
      when: { event: 'LifeChanged', player: 'you', gained: true },
      effect: { oracle: 'If you would gain life, you gain that much life plus 1 instead.' },
    });
  });

  it('an effect naming a target the ability does not list makes that ability unmodeled', () => {
    const { abilities, problems } = toTranslation('Bad Draft', {
      abilities: [{ kind: 'triggered', text: 'Whenever ...', when: { event: 'LifeChanged' }, effect: [{ gameAction: 'life', who: { target: 't9' }, amount: 1 }] }],
    });
    expect(abilities).toEqual([{ id: 'bad-draft#1', kind: 'unmodeled', text: 'Whenever ...' }]);
    expect(problems).toEqual(["bad-draft#1: its effects name target t9, which it doesn't list"]);
  });

  it('slugs double-faced names', () => {
    expect(abilitySlug('Delver of Secrets // Insectile Aberration')).toBe('delver-of-secrets-insectile-aberration');
  });
});

describe('draftTranslation', () => {
  it('sends the card and returns its Translation', async () => {
    const provider = scripted(JSON.stringify(example('Godless Shrine').draft));
    const drafted = await draftTranslation(provider, example('Godless Shrine').card);
    expect(drafted.abilities).toEqual([{ id: 'godless-shrine#1', kind: 'static', effect: { entersTapped: 'self', unless: { payLife: 2 } } }]);
    expect(provider.calls[0]!.user).toContain("As Godless Shrine enters, you may pay 2 life. If you don't, it enters tapped.");
  });

  it('a card with no Oracle text needs no call', async () => {
    const provider = scripted('{}');
    expect(await draftTranslation(provider, { name: 'Grizzly Bears', typeLine: 'Creature — Bear', oracleText: '' })).toEqual({ abilities: [], problems: [] });
    expect(provider.calls).toHaveLength(0);
  });

  it('an answer that fails validation twice makes the whole card unmodeled', async () => {
    const provider = scripted('{"abilities": [{"kind": "triggered"}]}');
    const card = example('Blood Artist').card;
    const drafted = await draftTranslation(provider, card);
    expect(provider.calls).toHaveLength(2);
    expect(drafted.abilities).toEqual([{ id: 'blood-artist#1', kind: 'unmodeled', text: card.oracleText }]);
    expect(drafted.problems[0]).toContain("doesn't match the schema");
  });

  it('a drafted Translation works in the engine: Authority of the Consuls taps and gains', async () => {
    const drafted = await draftTranslation(scripted(JSON.stringify(example('Authority of the Consuls').draft)), example('Authority of the Consuls').card);
    const cards: Record<string, CardDefinition> = {
      'Authority of the Consuls': { name: 'Authority of the Consuls', types: ['Enchantment'], abilities: drafted.abilities },
      'Savannah Lions': { name: 'Savannah Lions', types: ['Creature'], power: 2, toughness: 1, abilities: [] },
    };
    let state = createGame([{ id: 'theo', name: 'Theo' }, { id: 'michael', name: 'Michael' }], cards);
    for (const [card, playerId] of [['Authority of the Consuls', 'theo'], ['Savannah Lions', 'michael']] as const) {
      state = settle(applyAction(state, { type: 'cast', card }, { playerId, cause: { playerStatement: 's1' } }).state).state;
    }
    expect(Object.values(state.permanents).find((p) => p.card === 'Savannah Lions')!.tapped).toBe(true);
    expect(state.players.theo!.life).toBe(41);
  });
});
