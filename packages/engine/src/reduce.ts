import type { GameEvent } from './events.js';
import { clone } from './clone.js';
import type { GameState } from './state.js';

/** Folds one GameEvent into a copy of the state. This is the only place game state changes. */
export function reduce(state: GameState, event: GameEvent): GameState {
  const draft = clone(state);
  reduceInto(draft, event);
  return draft;
}

export function reduceInto(draft: GameState, event: GameEvent): void {
  draft.gameEventsThisTurn.push(event);
  advanceIds(draft, event);

  switch (event.type) {
    case 'PhaseStarted':
      draft.turn = { number: event.turn, activePlayerId: event.activePlayerId, step: event.step };
      return;

    case 'AttackersDeclared':
      draft.combat ??= { attacks: [], blocks: [], ready: [] };
      draft.combat.attacks.push(...event.attacks);
      return;

    case 'BlockersDeclared':
      draft.combat ??= { attacks: [], blocks: [], ready: [] };
      draft.combat.blocks.push(...event.blocks);
      return;

    case 'DamageDealt':
      for (const d of event.damage) {
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
      if (event.from === 'command') {
        const cz = draft.commandZone[event.casterId];
        if (cz) {
          cz.casts += 1;
          cz.inZone = false;
        }
      }
      return;

    case 'ZoneChanged':
      // A card moving between graveyard, exile and the command zone has no permanent ID.
      for (const id of event.objects.length ? event.objects : ['']) {
        if (event.from === 'battlefield') delete draft.permanents[id];
        if (event.from === 'graveyard') removeOne(draft.graveyards[event.ownerId], event.card);
        if (event.from === 'exile') {
          const i = draft.exile.findIndex((x) => x.card === event.card && x.ownerId === event.ownerId);
          if (i >= 0) draft.exile.splice(i, 1);
        }

        switch (event.to) {
          case 'battlefield':
            if (!id) break;
            if (event.tokenDefinition && !draft.cards[event.card]) {
              draft.cards[event.card] = { name: event.card, ...event.tokenDefinition, abilities: [] };
            }
            draft.permanents[id] = {
              id,
              card: event.card,
              ownerId: event.ownerId,
              controllerId: event.controllerId ?? event.ownerId,
              tapped: event.tapped ?? false,
              controlledSince: draft.turn.number,
              damage: 0,
              deathtouchDamage: false,
              counters: {},
              effects: [],
              isToken: event.isToken ?? false,
            };
            break;
          case 'graveyard':
            if (!event.isToken) draft.graveyards[event.ownerId]?.push(event.card);
            break;
          case 'exile':
            if (!event.isToken) draft.exile.push({ card: event.card, ownerId: event.ownerId });
            break;
          case 'command': {
            const cz = draft.commandZone[event.ownerId];
            if (cz && cz.card === event.card) cz.inZone = true;
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
  if (event.type === 'ZoneChanged' && event.to === 'battlefield') for (const id of event.objects) bump('permanent', id, 'p');
}
