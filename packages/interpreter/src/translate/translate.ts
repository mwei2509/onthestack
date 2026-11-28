import type { AbilityDefinition, EffectTemplate } from '@onthestack/engine';
import { LlmOutputError, retryInvalidOutput, type LlmProvider, type LlmResult } from '../llm/provider.js';
import { cardBlock, TRANSLATE_SYSTEM } from './prompt.js';
import { TranslationDraft, type AbilityDraft } from './schema.js';

/** What drafting reads: a card's name, type line and Oracle text, each face labelled for a double-faced card. */
export interface CardText {
  name: string;
  typeLine: string;
  oracleText: string;
}

export interface DraftedTranslation {
  abilities: AbilityDefinition[];
  /** Why any drafted ability was turned into `unmodeled`, or why the whole card was. */
  problems: string[];
  result?: LlmResult<TranslationDraft>;
}

/** "Haliya, Guided by Light" → "haliya-guided-by-light", the prefix of each ability's id. */
export const abilitySlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Drafts a card's Translation from its Oracle text (ADR 0132), with one retry on an answer that fails validation. If
 * the answer still doesn't validate, the whole card is `unmodeled`: never a guess.
 */
export async function draftTranslation(provider: LlmProvider, card: CardText): Promise<DraftedTranslation> {
  if (!card.oracleText.trim()) return { abilities: [], problems: [] };
  let result: LlmResult<TranslationDraft>;
  try {
    result = await retryInvalidOutput(provider).complete({ system: TRANSLATE_SYSTEM, user: cardBlock(card), schema: TranslationDraft });
  } catch (e) {
    if (!(e instanceof LlmOutputError)) throw e;
    return { abilities: [{ id: `${abilitySlug(card.name)}#1`, kind: 'unmodeled', text: card.oracleText }], problems: [e.message] };
  }
  return { ...toTranslation(card.name, result.output), result };
}

/** Numbers the drafted abilities and checks what Zod can't: every target an effect names is one the ability lists. */
export function toTranslation(name: string, draft: TranslationDraft): { abilities: AbilityDefinition[]; problems: string[] } {
  const slug = abilitySlug(name);
  const problems: string[] = [];
  const abilities = draft.abilities.map((a, i): AbilityDefinition => {
    const id = `${slug}#${i + 1}`;
    const unknown = unknownTargets(a);
    if (unknown.length > 0) {
      problems.push(`${id}: its effects name target ${unknown.join(', ')}, which it doesn't list`);
      return { id, kind: 'unmodeled', text: a.text };
    }
    switch (a.kind) {
      case 'triggered':
      case 'static':
      case 'spell': {
        const rest: Record<string, unknown> = { ...a };
        delete rest.text;
        return { id, ...rest } as AbilityDefinition;
      }
      case 'alwaysOn':
        return { id, kind: 'static', ...(a.zone ? { zone: a.zone } : {}), ...(a.when ? { when: a.when } : {}), effect: { oracle: a.text } };
      case 'mana':
        return { id, kind: 'mana', note: a.text };
      case 'unmodeled':
        return { id, kind: 'unmodeled', text: a.text };
    }
  });
  return { abilities, problems };
}

function unknownTargets(a: AbilityDraft): string[] {
  if (a.kind !== 'triggered' && a.kind !== 'spell') return [];
  const listed = new Set((a.targets ?? []).map((t) => t.id));
  const named = new Set<string>();
  const ref = (r: unknown) => {
    if (typeof r === 'object' && r !== null && 'target' in r) named.add(String(r.target));
  };
  for (const e of a.effect as EffectTemplate[]) {
    if ('who' in e) ref(e.who);
    if ('object' in e) ref(e.object);
    if ('to' in e) ref(e.to);
    const amount = 'amount' in e ? e.amount : 'count' in e ? e.count : undefined;
    if (typeof amount === 'object' && 'powerOf' in amount && amount.powerOf === 'target' && listed.size === 0) named.add('(power of a target)');
  }
  return [...named].filter((t) => !listed.has(t));
}
