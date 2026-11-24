import type { GameAction } from './actions.js';
import { applyAction } from './apply.js';
import { clone } from './clone.js';
import { dealCombatDamage, endCombat, firstStrikeStepNeeded, menaceShortOfBlockers } from './combat.js';
import { emit } from './emit.js';
import type { GameEvent, TableEvent, TableEventDraft } from './events.js';
import type { PermanentId, PlayerId } from './ids.js';
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
 * `responsePending` leaves the Stack unresolved at the end, as if a Response were about to be applied.
 */
export function replayTurn(
  turnStart: GameState,
  timeline: TimelineEntry[],
  options: { currentStep?: Step; responsePending?: boolean } = {},
): ReplayResult {
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
    if (stepSkipped(step, state, timeline.some((e) => e.step === step))) continue;

    const draft = clone(state);
    const started: GameEvent[] = [];
    emit(draft, started, { type: 'PhaseStarted', step, activePlayerId: draft.turn.activePlayerId, turn: draft.turn.number }, { rule: 'turnStructure' });
    take({ state: draft, events: started, warnings: [] });
    take(automatic(state, step));
    const entries = timeline.filter((e) => e.step === step);
    const holdAtEnd = options.responsePending === true && step === last;
    settleNow(!(holdAtEnd && entries.length === 0));

    entries.forEach((entry, i) => {
      take(applyAction(state, entry.gameAction, { playerId: entry.playerId, cause: entry.from[0] ? { playerStatement: entry.from[0] } : { rule: 'turnStructure' } }));
      const next = entries[i + 1];
      settleNow(next ? !next.response : !holdAtEnd);
    });
  }
  return { state, events, tableEvents: numbered(tableEvents), warnings };
}

/** Whether the rules skip a Step, given the board as it reaches it. `recorded`: the timeline has entries in that Step. */
function stepSkipped(step: Step, state: GameState, recorded: boolean): boolean {
  const noAttackers = !state.combat?.attacks.length;
  if (step === 'firstStrikeDamage') return noAttackers || !firstStrikeStepNeeded(state);
  if (step === 'combatDamage') return noAttackers;
  if (step === 'declareBlockers') return noAttackers && !recorded;
  return false;
}

/**
 * The Steps still to come this turn, given the board now, leaving out the ones the rules skip (ADR 0065). Next step
 * moves to the first; after the last, the turn ends.
 */
export function stepsAhead(state: GameState): Step[] {
  return STEPS.slice(stepIndex(state.turn.step) + 1).filter((step) => !stepSkipped(step, state, false));
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
    case 'firstStrikeDamage':
      return dealCombatDamage(draft, 'firstStrikeDamage');
    case 'combatDamage':
      return dealCombatDamage(draft, 'combatDamage');
    case 'endOfCombat':
      return endCombat(draft);
    case 'cleanup': {
      const permanents = Object.values(draft.permanents);
      emit(
        draft,
        events,
        {
          type: 'CleanedUp',
          damageRemoved: permanents.filter((p) => p.damage > 0 || p.deathtouchDamage).map((p) => ({ permanentId: p.id, amount: p.damage })),
          effectsEnded: permanents.flatMap((p) => p.effects.filter((e) => e.until === 'endOfTurn').map((e) => ({ permanentId: p.id, timestamp: e.timestamp }))),
          controlReturned: permanents.flatMap((p) => (p.controlChange?.until === 'endOfTurn' ? [{ permanentId: p.id, to: p.controlChange.revertTo }] : [])),
        },
        { rule: 'turnStructure' },
      );
      break;
    }
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
  /** Things to do now that need no record, like the draw (ADR 0028). Computed for the screen, never stored. */
  reminders: { text: string; playerId?: PlayerId; permanentId?: PermanentId }[];
  warnings: RulesWarning[];
  /** The Steps still to come this turn (`stepsAhead`), so screens can name the next one without running the engine. */
  stepsAhead: Step[];
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
    reminders: [...stepReminders(state), ...combatReminders(state)],
    warnings: result.warnings,
    stepsAhead: stepsAhead(state),
  };
}

function combatReminders(state: GameState): TableView['reminders'] {
  if (stepIndex(state.turn.step) >= stepIndex('firstStrikeDamage')) return [];
  return menaceShortOfBlockers(state).map((p) => ({ text: 'Menace: needs another blocker', permanentId: p.id }));
}

function stepReminders(state: GameState): TableView['reminders'] {
  if (state.turn.step === 'draw') return [{ text: 'Draw a card', playerId: state.turn.activePlayerId }];
  return [];
}
