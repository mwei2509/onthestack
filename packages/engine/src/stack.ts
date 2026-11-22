import { applyAction, PERMANENT_TYPES } from './apply.js';
import { clone } from './clone.js';
import { emit } from './emit.js';
import type { GameEvent } from './events.js';
import type { GameState, StackItem } from './state.js';
import type { RulesWarning } from './warnings.js';

export interface ResolveResult {
  state: GameState;
  events: GameEvent[];
  warnings: RulesWarning[];
}

/**
 * Resolves the top Stack item (CR 608). A spell or ability whose targets are all gone Fizzles. Otherwise its
 * GameActions run in order, each caused by the item, and a spell then enters the battlefield or goes to its
 * owner's graveyard.
 */
export function resolveTop(state: GameState): ResolveResult {
  let draft = clone(state);
  const events: GameEvent[] = [];
  const warnings: RulesWarning[] = [];
  const item = draft.stack.at(-1);
  if (!item) return { state: draft, events, warnings };

  if (allTargetsGone(item, draft)) {
    const fizzled = emit(draft, events, { type: 'StackItemResolved', stackItemId: item.id, status: 'fizzled' }, { stackItem: item.id });
    if (item.kind === 'spell') {
      emit(draft, events, { type: 'ZoneChanged', objects: [item.id], card: item.source.card, ownerId: item.controllerId, from: 'stack', to: 'graveyard', how: 'fizzled' }, { gameEvent: fizzled.id });
    }
    return { state: draft, events, warnings };
  }

  item.gameActions.forEach((gameAction, i) => {
    const r = applyAction(draft, gameAction, {
      playerId: item.controllerId,
      cause: { stackItem: item.id, gameAction: i, ...(item.triggeredBy ? { triggeredBy: item.triggeredBy } : {}) },
    });
    draft = r.state;
    events.push(...r.events);
    warnings.push(...r.warnings);
  });

  emit(draft, events, { type: 'StackItemResolved', stackItemId: item.id, status: 'resolved' }, { stackItem: item.id });
  if (item.kind !== 'spell') return { state: draft, events, warnings };

  const def = draft.cards[item.source.card];
  if (!def) {
    warnings.push({
      code: 'unknownCard',
      message: `${item.source.card} resolved, but it isn't in this game's card list, so the app can't tell where it went. Correct the board if needed.`,
    });
  } else if (def.types.some((t) => PERMANENT_TYPES.has(t))) {
    emit(
      draft,
      events,
      { type: 'ZoneChanged', objects: [`p${draft.nextIds.permanent++}`], card: item.source.card, ownerId: item.controllerId, from: 'stack', to: 'battlefield', how: 'resolve', controllerId: item.controllerId },
      { stackItem: item.id },
    );
  } else {
    emit(draft, events, { type: 'ZoneChanged', objects: [item.id], card: item.source.card, ownerId: item.controllerId, from: 'stack', to: 'graveyard', how: 'resolve' }, { stackItem: item.id });
  }
  return { state: draft, events, warnings };
}

function allTargetsGone(item: StackItem, state: GameState): boolean {
  if (item.targets.length === 0) return false;
  return item.targets.every((t) => !state.permanents[t] && !state.stack.some((k) => k.id === t) && !state.players[t]);
}
