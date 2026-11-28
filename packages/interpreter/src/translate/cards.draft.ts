import { it } from 'vitest';
import { costOf, providersFromEnv } from '../evals/providers.js';
import { fetchCardText } from './scryfall.js';
import { draftTranslation } from './translate.js';

// CARDS="Blood Artist|Godless Shrine" pnpm --filter @onthestack/interpreter draft
const names = (process.env.CARDS ?? '').split('|').map((s) => s.trim()).filter(Boolean);
const providers = providersFromEnv({ EVAL_PROVIDERS: 'claude', ...process.env });

if (names.length === 0 || providers.length === 0) {
  it.skip('set CARDS and a provider key: see packages/interpreter/README.md', () => {});
}

for (const provider of providers) {
  it.each(names)(`${provider.id}: %s`, async (name) => {
    const card = await fetchCardText(name);
    const drafted = await draftTranslation(provider, card);
    const usage = drafted.result?.usage;
    const lines = [`\n## ${card.name} (${provider.id})`, JSON.stringify(drafted.abilities, null, 2)];
    for (const p of drafted.problems) lines.push(`Problem: ${p}`);
    if (usage) {
      lines.push(`Tokens: ${usage.inputTokens} in, ${usage.outputTokens} out, ${usage.cacheReadTokens ?? 0} cache read, ${usage.cacheWriteTokens ?? 0} cache write · $${costOf(provider.id, usage).toFixed(5)}`);
    }
    console.log(lines.join('\n'));
  });
}
