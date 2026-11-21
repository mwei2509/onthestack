import type { GameState, Permanent } from './state.js';

export interface Stats {
  isCreature: boolean;
  power: number;
  toughness: number;
  keywords: string[];
}

/**
 * Current power, toughness and keywords, calculated whenever asked (never stored), in the rules' layer 7 order:
 * printed values, then "becomes X/Y" effects by timestamp, then modifiers and counters, then switches (CR 613.4).
 */
export function stats(permanent: Permanent, state: GameState): Stats {
  const def = state.cards[permanent.card];
  const keywords = new Set(def?.keywords ?? []);
  let power = def?.power ?? 0;
  let toughness = def?.toughness ?? 0;

  const byTime = [...permanent.effects].sort((a, b) => a.timestamp - b.timestamp);
  for (const e of byTime) {
    if (e.kind === 'set') {
      if (e.power !== undefined) power = e.power;
      if (e.toughness !== undefined) toughness = e.toughness;
    }
  }
  for (const e of byTime) {
    if (e.kind === 'add') {
      power += e.power ?? 0;
      toughness += e.toughness ?? 0;
    }
    for (const k of e.keywords ?? []) keywords.add(k);
  }
  const plus = permanent.counters['+1/+1'] ?? 0;
  const minus = permanent.counters['-1/-1'] ?? 0;
  power += plus - minus;
  toughness += plus - minus;
  if (byTime.filter((e) => e.kind === 'switch').length % 2 === 1) [power, toughness] = [toughness, power];

  return { isCreature: def?.types.includes('Creature') ?? false, power, toughness, keywords: [...keywords].sort() };
}

export const hasKeyword = (permanent: Permanent, state: GameState, keyword: string): boolean =>
  stats(permanent, state).keywords.includes(keyword);
