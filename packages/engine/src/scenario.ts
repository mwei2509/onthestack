import type { GameAction } from './actions.js';
import type { CardDefinition } from './cards.js';
import { clone } from './clone.js';
import { emit } from './emit.js';
import type { GameEvent } from './events.js';
import { createGame } from './game.js';
import type { CardName, PermanentId, PlayerId } from './ids.js';
import type { GameState } from './state.js';
import type { Step } from './steps.js';
import type { TimelineEntry } from './timeline.js';
import { replayTurn, sealTurn, type ReplayResult, type SealedTurn } from './turn.js';
import type { RulesWarning } from './warnings.js';

/**
 * Declarative rules scenarios in the style of XMage's card tests (ADR 0035): set up a board, say what players do on
 * which turn and step, run to a point, then assert. GameActions go straight to the engine, without the interpreter.
 * Test-only; not exported from the package.
 */
export interface Scenario {
  /** Puts a card on a player's battlefield before the game starts, controlled since before turn 1. Returns its ID. */
  battlefield(playerId: PlayerId, card: CardName): PermanentId;
  say(turn: number, step: Step, playerId: PlayerId, gameAction: GameAction, options?: { response?: boolean }): Scenario;
  /** Plays every turn up to `turn`, stopping after `step` in it. */
  runUntil(turn: number, step: Step): ScenarioResult;
}

export interface ScenarioResult {
  state: GameState;
  sealed: SealedTurn[];
  events: GameEvent[];
  warnings: RulesWarning[];
  life(playerId: PlayerId): number;
  /** Cards on the battlefield controlled by this player. */
  controls(playerId: PlayerId): CardName[];
  graveyard(playerId: PlayerId): CardName[];
}

export function scenario(options: { seats: PlayerId[]; life?: number; cards: Record<CardName, CardDefinition> }): Scenario {
  let setup = createGame(options.seats.map((id) => ({ id, name: id })), options.cards);
  if (options.life !== undefined) for (const p of Object.values(setup.players)) p.life = options.life;
  const entries: { turn: number; entry: TimelineEntry }[] = [];
  let statement = 0;

  const api: Scenario = {
    battlefield(playerId, card) {
      const draft = clone(setup);
      const id = `p${draft.nextIds.permanent}`;
      emit(draft, [], { type: 'ZoneChanged', from: 'hand', to: 'battlefield', moves: [{ objectId: id, card, ownerId: playerId, controllerId: playerId }] }, { rule: 'boardCorrection' });
      draft.permanents[id]!.controlledSince = 0;
      draft.gameEventsThisTurn = [];
      draft.pendingTriggers = [];
      setup = draft;
      return id;
    },
    say(turn, step, playerId, gameAction, sayOptions = {}) {
      entries.push({ turn, entry: { step, playerId, gameAction, from: [`s${++statement}`], ...(sayOptions.response ? { response: true } : {}) } });
      return api;
    },
    runUntil(turn, step) {
      let turnStart = setup;
      const sealed: SealedTurn[] = [];
      const events: GameEvent[] = [];
      const warnings: RulesWarning[] = [];
      for (let t = 1; t < turn; t++) {
        const r = sealTurn(turnStart, timelineFor(t));
        sealed.push(r.sealed);
        events.push(...r.sealed.gameEvents);
        warnings.push(...r.warnings);
        turnStart = r.nextTurnStart;
      }
      const last: ReplayResult = replayTurn(turnStart, timelineFor(turn), { currentStep: step });
      events.push(...last.events);
      warnings.push(...last.warnings);
      const state = last.state;
      return {
        state,
        sealed,
        events,
        warnings,
        life: (p) => state.players[p]!.life,
        controls: (p) => Object.values(state.permanents).filter((x) => x.controllerId === p).map((x) => x.card).sort(),
        graveyard: (p) => [...(state.graveyards[p] ?? [])],
      };
    },
  };
  const timelineFor = (turn: number) => entries.filter((e) => e.turn === turn).map((e) => e.entry);
  return api;
}
