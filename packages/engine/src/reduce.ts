import type { GameEvent } from './events.js';
import { clone } from './clone.js';
import { looksBack, scanTriggers } from './triggers.js';
import type { GameState } from './state.js';

/** Folds one GameEvent into a copy of the state. This is the only place game state changes. */
export function reduce(state: GameState, event: GameEvent): GameState {
  const draft = clone(state);
  reduceInto(draft, event);
  return draft;
}

export function reduceInto(draft: GameState, event: GameEvent): void {
  const lookBack = looksBack(event);
  const before = lookBack ? scanTriggers(draft, event) : [];
  draft.gameEventsThisTurn.push(event);
  advanceIds(draft, event);
  applyEvent(draft, event);
  draft.pendingTriggers.push(...(lookBack ? before : scanTriggers(draft, event)));
}

function applyEvent(draft: GameState, event: GameEvent): void {
  switch (event.type) {
    case 'PhaseStarted':
      draft.turn = { number: event.turn, activePlayerId: event.activePlayerId, step: event.step };
      return;

    case 'AttackersDeclared':
      draft.combat ??= { attacks: [], blocks: [], ready: [], divisions: {} };
      draft.combat.attacks.push(...event.attacks);
      return;

    case 'BlockersDeclared':
      draft.combat ??= { attacks: [], blocks: [], ready: [], divisions: {} };
      draft.combat.blocks.push(...event.blocks);
      if (!draft.combat.ready.includes(event.defenderId)) draft.combat.ready.push(event.defenderId);
      return;

    case 'DamageAssignmentSet':
      if (draft.combat) draft.combat.divisions[event.attackerId] = event.split;
      return;

    case 'CombatEnded':
      draft.combat = null;
      return;

    case 'CleanedUp':
      draft.combat = null;
      for (const p of Object.values(draft.permanents)) {
        p.damage = 0;
        p.deathtouchDamage = false;
        p.effects = p.effects.filter((e) => e.until !== 'endOfTurn');
        if (p.controlUntil) {
          p.controllerId = p.controlUntil.revertTo;
          p.controlledSince = draft.turn.number;
          delete p.controlUntil;
        }
      }
      return;

    case 'DamageDealt':
      for (const d of event.damage) {
        if (d.combat && 'playerId' in d.recipient) {
          const source = draft.permanents[d.sourceId];
          const player = draft.players[d.recipient.playerId];
          if (source && player && draft.commandZone[source.ownerId]?.card === source.card) {
            player.commanderDamage[source.card] = (player.commanderDamage[source.card] ?? 0) + d.amount;
          }
        }
        if ('permanentId' in d.recipient) {
          const p = draft.permanents[d.recipient.permanentId];
          if (p) {
            p.damage += d.amount;
            if (d.deathtouch && d.amount > 0) p.deathtouchDamage = true;
          }
        }
      }
      return;

    case 'LifeChanged': {
      const player = draft.players[event.playerId];
      if (player) player.life += event.delta;
      return;
    }

    case 'SpellCast':
      draft.stack.push({
        id: event.stackItemId,
        kind: 'spell',
        controllerId: event.casterId,
        source: { card: event.card },
        targets: event.targets,
        gameActions: event.gameActions,
        status: 'pending',
      });
      if (event.from === 'command') {
        const cz = draft.commandZone[event.casterId];
        if (cz) {
          cz.casts += 1;
          cz.inZone = false;
        }
      }
      return;

    case 'ZoneChanged':
      for (const move of event.moves) {
        const id = move.objectId ?? '';
        if (event.from === 'battlefield') delete draft.permanents[id];
        if (event.from === 'graveyard') removeOne(draft.graveyards[move.ownerId], move.card);
        if (event.from === 'exile') {
          const i = draft.exile.findIndex((x) => x.card === move.card && x.ownerId === move.ownerId);
          if (i >= 0) draft.exile.splice(i, 1);
        }

        switch (event.to) {
          case 'battlefield':
            if (!id) break;
            if (move.tokenDefinition && !draft.cards[move.card]) {
              draft.cards[move.card] = { name: move.card, ...move.tokenDefinition, abilities: [] };
            }
            draft.permanents[id] = {
              id,
              card: move.card,
              ownerId: move.ownerId,
              controllerId: move.controllerId ?? move.ownerId,
              tapped: move.tapped ?? false,
              controlledSince: draft.turn.number,
              damage: 0,
              deathtouchDamage: false,
              counters: {},
              effects: [],
              isToken: move.isToken ?? false,
            };
            break;
          case 'graveyard':
            if (!move.isToken) draft.graveyards[move.ownerId]?.push(move.card);
            break;
          case 'exile':
            if (!move.isToken) draft.exile.push({ card: move.card, ownerId: move.ownerId });
            break;
          case 'command': {
            const cz = draft.commandZone[move.ownerId];
            if (cz && cz.card === move.card) cz.inZone = true;
            break;
          }
          default:
            break;
        }
      }
      return;

    case 'CountersChanged':
      if ('playerId' in event.target) {
        const player = draft.players[event.target.playerId];
        if (player && event.kind === 'poison') player.poison = Math.max(0, player.poison + event.delta);
      } else {
        const p = draft.permanents[event.target.permanentId];
        if (p) {
          const next = Math.max(0, (p.counters[event.kind] ?? 0) + event.delta);
          if (next === 0) delete p.counters[event.kind];
          else p.counters[event.kind] = next;
        }
      }
      return;

    case 'PlayerLost': {
      const player = draft.players[event.playerId];
      if (player) player.out = true;
      return;
    }

    case 'TapChanged': {
      const p = draft.permanents[event.permanentId];
      if (p) p.tapped = event.tapped;
      return;
    }

    case 'ControlChanged': {
      const p = draft.permanents[event.permanentId];
      if (p) {
        if (event.until) p.controlUntil = { revertTo: p.controllerId, until: event.until };
        else delete p.controlUntil;
        p.controllerId = event.controllerId;
        p.controlledSince = draft.turn.number;
      }
      return;
    }

    case 'EffectAdded': {
      const p = draft.permanents[event.permanentId];
      if (p) p.effects.push(event.effect);
      return;
    }

    case 'StackItemResolved':
      draft.stack = draft.stack.filter((item) => item.id !== event.stackItemId);
      return;

    case 'AbilityTriggered': {
      const { stackItem } = event;
      draft.stack.push(stackItem);
      const i = draft.pendingTriggers.findIndex(
        (t) => t.ability === stackItem.ability && t.triggeredBy === stackItem.triggeredBy && t.source.permanentId === stackItem.source.permanentId,
      );
      if (i >= 0) draft.pendingTriggers.splice(i, 1);
      return;
    }

    case 'PlayerTaskCreated':
      return;
  }
}

function removeOne(list: string[] | undefined, item: string): void {
  if (!list) return;
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
}

/** Keeps the ID counters past every ID an event introduces, so folding events alone rebuilds the counters too. */
function advanceIds(draft: GameState, event: GameEvent): void {
  const bump = (key: keyof GameState['nextIds'], id: string, prefix: string) => {
    if (!id.startsWith(prefix)) return;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n)) draft.nextIds[key] = Math.max(draft.nextIds[key], n + 1);
  };
  bump('gameEvent', event.id, 'e');
  if (event.type === 'SpellCast') bump('stackItem', event.stackItemId, 'k');
  if (event.type === 'AbilityTriggered') bump('stackItem', event.stackItem.id, 'k');
  if (event.type === 'ZoneChanged' && event.to === 'battlefield') for (const m of event.moves) if (m.objectId) bump('permanent', m.objectId, 'p');
}
