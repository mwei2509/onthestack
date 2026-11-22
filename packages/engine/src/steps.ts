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

export const ZONES = ['battlefield', 'graveyard', 'exile', 'command', 'stack', 'hand', 'library'] as const;

export type Zone = (typeof ZONES)[number];

export const HIDDEN_ZONES: readonly Zone[] = ['hand', 'library'];
