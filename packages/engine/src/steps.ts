export const STEPS = [
  'untap',
  'upkeep',
  'draw',
  'main1',
  'beginningOfCombat',
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
  'endOfCombat',
  'main2',
  'end',
  'cleanup',
] as const;

export type Step = (typeof STEPS)[number];

export type Zone = 'battlefield' | 'graveyard' | 'exile' | 'command' | 'stack' | 'hand' | 'library';

export const HIDDEN_ZONES: readonly Zone[] = ['hand', 'library'];
