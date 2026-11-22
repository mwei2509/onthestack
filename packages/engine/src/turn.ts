import type { GameAction } from './actions.js';
import { applyAction } from './apply.js';
import { clone } from './clone.js';
import { dealCombatDamage, endCombat, firstStrikeStepNeeded } from './combat.js';
import { emit } from './emit.js';
import type { GameEvent, TableEvent, TableEventDraft } from './events.js';
import type { PlayerId } from './ids.js';
import { settle } from './settle.js';
import type { GameState, Permanent, StackItem } from './state.js';
import { stats, type Stats } from './stats.js';
import { STEPS, type Step } from './steps.js';
import type { TimelineEntry } from './timeline.js';
import type { RulesWarning } from './warnings.js';

export interface ReplayResult {
  state: GameState;
  events: GameEvent[];
  tableEvents: TableEvent[];
  warnings: RulesWarning[];
}

type StepResult = { state: GameState; events: GameEvent[]; tableEvents?: TableEventDraft[]; warnings: RulesWarning[] };

/** TableEvents get their IDs in the order a replay records them, so the same replay always gives the same IDs. */
const numbered = (drafts: TableEventDraft[]): TableEvent[] => drafts.map((t, i) => ({ ...t, id: `t${i + 1}` }));

const stepIndex = (step: Step) => STEPS.indexOf(step);

/**
 * Replays a turn from its starting snapshot (ADR 0014, 0016): each Step in order, its automatic actions, then the
 * timeline entries placed in it, settling the board after each. Pure: the same snapshot and timeline always give
 * the same result, IDs included. Stops after `currentStep`; by default, the last Step the timeline reaches.
 */
export function replayTurn(turnStart: GameState, timeline: TimelineEntry[], options: { currentStep?: Step } = {}): ReplayResult {
  const last = options.currentStep ?? timeline.reduce<Step>((s, e) => (stepIndex(e.step) > stepIndex(s) ? e.step : s), 'untap');
  let state = clone(turnStart);
  const events: GameEvent[] = [];
  const tableEvents: TableEventDraft[] = [];
  const warnings: RulesWarning[] = [];

  const take = (r: StepResult) => {
    state = r.state;
    events.push(...r.events);
    tableEvents.push(...(r.tableEvents ?? []));
    warnings.push(...r.warnings);
  };
  const settleNow = (resolveStack = true) => take(settle(state, { resolveStack }));

  for (const step of STEPS.slice(0, stepIndex(last) + 1)) {
    const noAttackers = !state.combat?.attacks.length;
    if (step === 'firstStrikeDamage' && (noAttackers || !firstStrikeStepNeeded(state))) continue;
    if (step === 'combatDamage' && noAttackers) continue;
    if (step === 'declareBlockers' && noAttackers && !timeline.some((e) => e.step === step)) continue;

    const draft = clone(state);
    const started: GameEvent[] = [];
    emit(draft, started, { type: 'PhaseStarted', step, activePlayerId: draft.turn.activePlayerId, turn: draft.turn.number }, { rule: 'turnStructure' });
    take({ state: draft, events: started, warnings: [] });
    take(automatic(state, step));
    settleNow();

    const entries = timeline.filter((e) => e.step === step);
    entries.forEach((entry, i) => {
      take(applyAction(state, entry.gameAction, { playerId: entry.playerId, cause: entry.from[0] ? { playerStatement: entry.from[0] } : { rule: 'turnStructure' } }));
      settleNow(!entries[i + 1]?.response);
    });
  }
  return { state, events, tableEvents: numbered(tableEvents), warnings };
}

function automatic(state: GameState, step: Step): StepResult {
  const draft = clone(state);
  const events: GameEvent[] = [];
  const active = draft.turn.activePlayerId;
  switch (step) {
    case 'untap':
      for (const p of Object.values(draft.permanents)) {
        if (p.controllerId === active && p.tapped) emit(draft, events, { type: 'TapChanged', permanentId: p.id, tapped: false }, { rule: 'turnStructure' });
      }
      break;
    case 'draw':
      return { state: draft, events, tableEvents: [{ type: 'PlayerTaskCreated', playerId: active, text: 'Draw a card', causedBy: { rule: 'turnStructure' } }], warnings: [] };
    case 'firstStrikeDamage':
      return dealCombatDamage(draft, 'firstStrikeDamage');
    case 'combatDamage':
      return dealCombatDamage(draft, 'combatDamage');
    case 'endOfCombat':
      return endCombat(draft);
    case 'cleanup':
      emit(draft, events, { type: 'CleanedUp' }, { rule: 'turnStructure' });
      break;
    default:
      break;
  }
  return { state: draft, events, warnings: [] };
}

export interface SealedTurn {
  turn: number;
  activePlayerId: PlayerId;
  finalBoard: GameState;
  timeline: TimelineEntry[];
  gameEvents: GameEvent[];
  tableEvents: TableEvent[];
  /** Per player, for cards that ask about "your last turn" (ADR 0014). */
  summary: Record<PlayerId, { lifeChange: number }>;
}

/** Replays the whole turn through cleanup and returns its sealed record plus the next turn's starting snapshot. */
export function sealTurn(turnStart: GameState, timeline: TimelineEntry[]): { sealed: SealedTurn; nextTurnStart: GameState; warnings: RulesWarning[] } {
  const { state, events, tableEvents, warnings } = replayTurn(turnStart, timeline, { currentStep: 'cleanup' });
  const summary: SealedTurn['summary'] = {};
  for (const id of state.turnOrder) {
    summary[id] = { lifeChange: events.reduce((n, e) => n + (e.type === 'LifeChanged' && e.playerId === id ? e.delta : 0), 0) };
  }

  const next = clone(state);
  const order = next.turnOrder;
  let i = order.indexOf(next.turn.activePlayerId);
  for (let tries = 0; tries < order.length; tries++) {
    i = (i + 1) % order.length;
    if (!next.players[order[i]!]?.out) break;
  }
  next.turn = { number: next.turn.number + 1, activePlayerId: order[i]!, step: 'untap' };
  next.gameEventsThisTurn = [];

  return {
    sealed: { turn: state.turn.number, activePlayerId: state.turn.activePlayerId, finalBoard: state, timeline, gameEvents: events, tableEvents, summary },
    nextTurnStart: next,
    warnings,
  };
}

/**
 * Corrects the board to match the table (ADR 0034). Recorded as a pair (ADR 0020): a BoardCorrectionMade TableEvent
 * saying who corrected what, and the GameEvents it produced, caused by the correction. Corrections never trigger
 * abilities.
 */
export function applyBoardCorrection(state: GameState, correction: GameAction, playerId: PlayerId): ReplayResult {
  const applied = applyAction(state, correction, { playerId, cause: { rule: 'boardCorrection' } });
  const draft = clone(applied.state);
  draft.pendingTriggers = [];
  const settled = settle(draft, { resolveStack: false });
  const events = [...applied.events, ...settled.events];
  const made: TableEventDraft = { type: 'BoardCorrectionMade', playerId, gameAction: correction, gameEvents: events.map((e) => e.id), causedBy: { rule: 'boardCorrection' } };
  return { state: settled.state, events, tableEvents: numbered([made, ...applied.tableEvents, ...settled.tableEvents]), warnings: [...applied.warnings, ...settled.warnings] };
}

export interface PermanentView extends Permanent, Stats {}

export interface TableView {
  turn: GameState['turn'];
  players: GameState['players'];
  permanents: PermanentView[];
  stack: StackItem[];
  graveyards: GameState['graveyards'];
  exile: GameState['exile'];
  commandZone: GameState['commandZone'];
  /** Attacked players who still need to block or take it. */
  awaitingResponseFrom: PlayerId[];
  /** The damage that would happen, once every attacked player is Ready. */
  combatPreview: GameEvent[] | null;
  playerTasks: { playerId: PlayerId; text: string; from: string }[];
  warnings: RulesWarning[];
}

/** What every screen shows for a replay result. */
export function tableView(result: ReplayResult): TableView {
  const { state } = result;
  const attacked = [...new Set((state.combat?.attacks ?? []).filter((a) => state.permanents[a.attackerId]).map((a) => a.target))];
  const awaitingResponseFrom = attacked.filter((p) => !state.combat?.ready.includes(p));

  let combatPreview: GameEvent[] | null = null;
  if (state.combat && attacked.length > 0 && awaitingResponseFrom.length === 0 && stepIndex(state.turn.step) < stepIndex('combatDamage')) {
    let preview = state;
    const previewEvents: GameEvent[] = [];
    const first = firstStrikeStepNeeded(preview);
    for (const step of first ? (['firstStrikeDamage', 'combatDamage'] as const) : (['combatDamage'] as const)) {
      const started = clone(preview);
      emit(started, [], { type: 'PhaseStarted', step, activePlayerId: started.turn.activePlayerId, turn: started.turn.number }, { rule: 'turnStructure' });
      const dealt = dealCombatDamage(started, step);
      const settled = settle(dealt.state);
      preview = settled.state;
      previewEvents.push(...dealt.events, ...settled.events);
    }
    combatPreview = previewEvents;
  }

  return {
    turn: state.turn,
    players: state.players,
    permanents: Object.values(state.permanents).map((p) => ({ ...p, ...stats(p, state) })),
    stack: state.stack,
    graveyards: state.graveyards,
    exile: state.exile,
    commandZone: state.commandZone,
    awaitingResponseFrom,
    combatPreview,
    playerTasks: result.tableEvents.flatMap((e) => (e.type === 'PlayerTaskCreated' ? [{ playerId: e.playerId, text: e.text, from: e.id }] : [])),
    warnings: result.warnings,
  };
}
