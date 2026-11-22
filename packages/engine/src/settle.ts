import type { GameEvent, GameEventBody, TableEventDraft } from './events.js';
import { nextStackItemId, type GameEventId, type PermanentId } from './ids.js';
import { clone } from './clone.js';
import { emit } from './emit.js';
import { resolveTop } from './stack.js';
import { apnapOrder, toStackItem } from './triggers.js';
import type { GameState } from './state.js';
import { stats } from './stats.js';
import type { RulesWarning } from './warnings.js';

export const COMMANDER_DAMAGE_TO_LOSE = 21;
export const POISON_TO_LOSE = 10;
const MAX_PASSES = 100;

export interface SettleResult {
  state: GameState;
  events: GameEvent[];
  tableEvents: TableEventDraft[];
  warnings: RulesWarning[];
}

/**
 * Settles the board: state-based actions until none apply (CR 704.3), each pass found against the same state and
 * performed together so simultaneous deaths really are simultaneous. Then waiting triggers go on the Stack in APNAP
 * order and the check repeats (CR 603.3b). Then, unless a Response is pending, the top Stack item resolves and the
 * board settles again, until the Stack is empty.
 */
export function settle(state: GameState, options: { resolveStack?: boolean } = {}): SettleResult {
  const resolveStack = options.resolveStack ?? true;
  let draft = clone(state);
  const events: GameEvent[] = [];
  const tableEvents: TableEventDraft[] = [];
  const warnings: RulesWarning[] = [];

  for (let pass = 0; ; pass++) {
    if (pass >= MAX_PASSES) {
      warnings.push({ code: 'possibleLoop', message: 'The board keeps changing on its own. This looks like a loop; check the board.' });
      break;
    }
    const found = stateBasedActions(draft);
    if (found.length > 0) {
      for (const { body, after } of simultaneous(found)) {
        emit(draft, events, body, after ? { rule: 'stateBasedAction', after } : { rule: 'stateBasedAction' });
      }
      continue;
    }
    if (draft.pendingTriggers.length > 0) {
      for (const trigger of apnapOrder(draft, draft.pendingTriggers)) {
        const stackItem = toStackItem(draft, trigger, nextStackItemId(draft));
        emit(draft, events, { type: 'AbilityTriggered', stackItem }, { gameEvent: trigger.triggeredBy });
      }
      continue;
    }
    if (!resolveStack || draft.stack.length === 0) break;
    const r = resolveTop(draft);
    draft = r.state;
    events.push(...r.events);
    tableEvents.push(...r.tableEvents);
    warnings.push(...r.warnings);
  }
  return { state: draft, events, tableEvents, warnings };
}

/**
 * Everything found in one pass happens at the same moment (CR 704.3), so zone changes with the same from, to and
 * reason are merged into one GameEvent (ADR 0026). "Dies" triggers then look back at the board as it was before all
 * of them, so Blood Artist dying alongside other creatures sees every death.
 */
function simultaneous(found: Found[]): Found[] {
  const merged: Found[] = [];
  for (const f of found) {
    const body = f.body;
    if (body.type !== 'ZoneChanged') {
      merged.push(f);
      continue;
    }
    const same = merged.find((m) => m.body.type === 'ZoneChanged' && m.body.from === body.from && m.body.to === body.to && m.body.how === body.how);
    if (same && same.body.type === 'ZoneChanged') same.body.moves.push(...body.moves);
    else merged.push({ body: { ...body, moves: [...body.moves] } });
  }
  return merged;
}

interface Found {
  body: GameEventBody;
  /** The most recent GameEvent that brought this about, so the readback can say why. */
  after?: GameEventId;
}

function stateBasedActions(state: GameState): Found[] {
  const found: Found[] = [];
  const lastTouching = (id: PermanentId | string) => lastEventAbout(state, id);

  for (const player of Object.values(state.players)) {
    if (player.out) continue;
    if (player.life <= 0) found.push({ body: { type: 'PlayerLost', playerId: player.id, reason: 'life' }, after: lastTouching(player.id) });
    else if (player.poison >= POISON_TO_LOSE) found.push({ body: { type: 'PlayerLost', playerId: player.id, reason: 'poison' }, after: lastTouching(player.id) });
    else if (Object.values(player.commanderDamage).some((n) => n >= COMMANDER_DAMAGE_TO_LOSE)) {
      found.push({ body: { type: 'PlayerLost', playerId: player.id, reason: 'commanderDamage' }, after: lastTouching(player.id) });
    }
  }

  for (const p of Object.values(state.permanents)) {
    const owner = state.players[p.ownerId];
    const controller = state.players[p.controllerId];
    if (owner?.out) {
      found.push({ body: { type: 'ZoneChanged', from: 'battlefield', to: 'nowhere', how: 'stateBased', moves: [{ objectId: p.id, card: p.card, ownerId: p.ownerId, isToken: p.isToken }] } });
      continue;
    }
    if (controller?.out) {
      // The effect that gave the departing player control ends first; only what's still theirs is exiled (CR 800.4a).
      const revertTo = p.controlChange?.revertTo;
      if (revertTo && !state.players[revertTo]?.out) {
        found.push({ body: { type: 'ControlChanged', permanentId: p.id, controllerId: revertTo } });
      } else {
        found.push({ body: { type: 'ZoneChanged', from: 'battlefield', to: 'exile', how: 'stateBased', moves: [{ objectId: p.id, card: p.card, ownerId: p.ownerId, isToken: p.isToken }] } });
      }
      continue;
    }

    const s = stats(p, state);
    if (s.isCreature) {
      const indestructible = s.keywords.includes('Indestructible');
      const dies = s.toughness <= 0 || (!indestructible && ((s.toughness > 0 && p.damage >= s.toughness) || (p.deathtouchDamage && p.damage > 0)));
      if (dies) {
        const after = lastTouching(p.id);
        found.push({ body: { type: 'ZoneChanged', from: 'battlefield', to: 'graveyard', how: 'stateBased', moves: [{ objectId: p.id, card: p.card, ownerId: p.ownerId, isToken: p.isToken, ...(after ? { after } : {}) }] } });
        continue;
      }
    }

    const plus = p.counters['+1/+1'] ?? 0;
    const minus = p.counters['-1/-1'] ?? 0;
    const cancel = Math.min(plus, minus);
    if (cancel > 0) {
      found.push({ body: { type: 'CountersChanged', target: { permanentId: p.id }, kind: '+1/+1', delta: -cancel } });
      found.push({ body: { type: 'CountersChanged', target: { permanentId: p.id }, kind: '-1/-1', delta: -cancel } });
    }
  }

  // A commander put into a graveyard or exile goes to the command zone by default (CR 903.9a, ADR 0013).
  for (const [ownerId, cz] of Object.entries(state.commandZone)) {
    if (!cz || cz.inZone || state.players[ownerId]?.out) continue;
    if (state.graveyards[ownerId]?.includes(cz.card)) {
      found.push({ body: { type: 'ZoneChanged', from: 'graveyard', to: 'command', how: 'stateBased', moves: [{ card: cz.card, ownerId }] } });
    } else if (state.exile.some((x) => x.card === cz.card && x.ownerId === ownerId)) {
      found.push({ body: { type: 'ZoneChanged', from: 'exile', to: 'command', how: 'stateBased', moves: [{ card: cz.card, ownerId }] } });
    }
  }

  return found;
}

function lastEventAbout(state: GameState, id: string): GameEventId | undefined {
  for (let i = state.gameEventsThisTurn.length - 1; i >= 0; i--) {
    const e = state.gameEventsThisTurn[i]!;
    const touches =
      (e.type === 'DamageDealt' && e.damage.some((d) => ('permanentId' in d.recipient ? d.recipient.permanentId : d.recipient.playerId) === id)) ||
      (e.type === 'LifeChanged' && e.playerId === id) ||
      (e.type === 'EffectAdded' && e.permanentId === id) ||
      (e.type === 'CountersChanged' && ('permanentId' in e.target ? e.target.permanentId : e.target.playerId) === id);
    if (touches) return e.id;
  }
  return undefined;
}
