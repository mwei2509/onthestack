import type { Step, TableView } from '@onthestack/engine';

export const STEP_NAMES: Record<Step, string> = {
  untap: 'Untap',
  upkeep: 'Upkeep',
  draw: 'Draw',
  main1: 'Main 1',
  beginningOfCombat: 'Beginning of combat',
  declareAttackers: 'Declare attackers',
  declareBlockers: 'Declare blockers',
  firstStrikeDamage: 'First-strike damage',
  combatDamage: 'Combat damage',
  endOfCombat: 'End of combat',
  main2: 'Main 2',
  end: 'End',
  cleanup: 'Cleanup',
};

const SHORT_NAMES: Partial<Record<Step, string>> = {
  beginningOfCombat: 'Begin',
  declareAttackers: 'Attackers',
  declareBlockers: 'Blockers',
  firstStrikeDamage: 'First strike',
  combatDamage: 'Damage',
  endOfCombat: 'End',
};

const PHASES: { label: string; steps: Step[] }[] = [
  { label: 'Beginning', steps: ['untap', 'upkeep', 'draw'] },
  { label: 'Main', steps: ['main1'] },
  { label: 'Combat', steps: ['beginningOfCombat', 'declareAttackers', 'declareBlockers', 'firstStrikeDamage', 'combatDamage', 'endOfCombat'] },
  { label: 'Main', steps: ['main2'] },
  { label: 'Ending', steps: ['end', 'cleanup'] },
];

export type TickState = 'done' | 'current' | 'ahead';

/**
 * The step track: each phase with its Steps, marked done, current or ahead. First-strike damage only appears when it's
 * happening this turn, as most turns never have it.
 */
export function stepTrack(view: Pick<TableView, 'turn' | 'stepsAhead'>) {
  const current = view.turn.step;
  const order = PHASES.flatMap((p) => p.steps);
  const at = order.indexOf(current);
  const phases = PHASES.map((p) => ({
    label: p.label,
    steps: p.steps
      .filter((s) => s !== 'firstStrikeDamage' || s === current || view.stepsAhead.includes(s))
      .map((s) => {
        const i = order.indexOf(s);
        const state: TickState = i === at ? 'current' : i < at ? 'done' : 'ahead';
        return { step: s, name: STEP_NAMES[s], short: SHORT_NAMES[s] ?? STEP_NAMES[s], state };
      }),
  }));
  return { phase: PHASES.find((p) => p.steps.includes(current))!.label, phases };
}

/** Whose turn comes next: the next player clockwise who is still in the game. */
export function nextPlayerId(view: Pick<TableView, 'turn' | 'players'>): string {
  const order = Object.keys(view.players);
  const i = order.indexOf(view.turn.activePlayerId);
  for (let k = 1; k <= order.length; k++) {
    const id = order[(i + k) % order.length]!;
    if (!view.players[id]!.out) return id;
  }
  return view.turn.activePlayerId;
}
