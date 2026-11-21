import type { GameAction } from './actions.js';
import type { Cause, GameEvent, GameEventBody } from './events.js';
import type { PermanentId, PlayerId } from './ids.js';
import { clone } from './clone.js';
import { reduceInto } from './reduce.js';
import type { GameState, Permanent } from './state.js';
import type { RulesWarning } from './warnings.js';

const PERMANENT_TYPES = new Set(['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker']);

export interface ApplyContext {
  /** Who did it: the speaker for "I", or the player a statement named. */
  playerId: PlayerId;
  cause: Cause;
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  warnings: RulesWarning[];
}

/** Turns one GameAction into GameEvents and folds them into a copy of the state. */
export function applyAction(state: GameState, action: GameAction, ctx: ApplyContext): ApplyResult {
  const draft = clone(state);
  const events: GameEvent[] = [];
  const warnings: RulesWarning[] = [];

  const emit = (body: GameEventBody, causedBy: Cause = ctx.cause): GameEvent => {
    const event = { ...body, id: `e${draft.nextIds.gameEvent++}`, causedBy } as GameEvent;
    reduceInto(draft, event);
    events.push(event);
    return event;
  };
  const newPermanentId = (): PermanentId => `p${draft.nextIds.permanent++}`;
  const permanent = (id: PermanentId): Permanent | undefined => {
    const p = draft.permanents[id];
    if (!p) warnings.push({ code: 'notOnBattlefield', message: `${id} isn't on the battlefield.`, objectIds: [id] });
    return p;
  };
  const player = (id: PlayerId): boolean => {
    if (draft.players[id]) return true;
    warnings.push({ code: 'unknownPlayer', message: `${id} isn't in this game.` });
    return false;
  };

  switch (action.type) {
    case 'playLand': {
      const def = draft.cards[action.card];
      if (def && !def.types.includes('Land')) {
        warnings.push({ code: 'notALand', message: `${action.card} isn't a land.` });
      }
      emit({ type: 'ZoneChanged', objects: [newPermanentId()], card: action.card, ownerId: ctx.playerId, from: 'hand', to: 'battlefield', controllerId: ctx.playerId });
      break;
    }

    case 'cast': {
      const def = draft.cards[action.card];
      const cz = draft.commandZone[ctx.playerId];
      const from = cz?.inZone && cz.card === action.card ? 'command' : 'hand';
      const stackItemId = `k${draft.nextIds.stackItem++}`;
      emit({ type: 'SpellCast', casterId: ctx.playerId, card: action.card, targets: action.targets ?? [], stackItemId, from });
      if (!def) {
        warnings.push({ code: 'unknownCard', message: `${action.card} isn't in this game's card list. Check the card.` });
        break;
      }
      if (def.types.some((t) => PERMANENT_TYPES.has(t))) {
        emit(
          { type: 'ZoneChanged', objects: [newPermanentId()], card: action.card, ownerId: ctx.playerId, from: 'stack', to: 'battlefield', how: 'resolve', controllerId: ctx.playerId },
          { stackItem: stackItemId },
        );
      } else {
        emit(
          { type: 'ZoneChanged', objects: [stackItemId], card: action.card, ownerId: ctx.playerId, from: 'stack', to: 'graveyard', how: 'resolve' },
          { stackItem: stackItemId },
        );
      }
      break;
    }

    case 'move': {
      const p = permanent(action.objectId);
      if (!p) break;
      emit({ type: 'ZoneChanged', objects: [p.id], card: p.card, ownerId: p.ownerId, from: 'battlefield', to: action.to, how: action.how, isToken: p.isToken });
      break;
    }

    case 'tap':
    case 'untap': {
      const p = permanent(action.permanentId);
      if (!p) break;
      emit({ type: 'TapChanged', permanentId: p.id, tapped: action.type === 'tap' });
      break;
    }

    case 'gainControl': {
      const p = permanent(action.permanentId);
      if (!p) break;
      emit({ type: 'ControlChanged', permanentId: p.id, controllerId: ctx.playerId, until: action.until });
      break;
    }

    case 'counters': {
      if ('permanentId' in action.target ? !permanent(action.target.permanentId) : !player(action.target.playerId)) break;
      emit({ type: 'CountersChanged', target: action.target, kind: action.kind, delta: action.delta });
      break;
    }

    case 'modify': {
      const p = permanent(action.permanentId);
      if (!p) break;
      emit({
        type: 'EffectAdded',
        permanentId: p.id,
        effect: { kind: 'add', power: action.power, toughness: action.toughness, keywords: action.keywords, until: action.until, timestamp: draft.nextIds.gameEvent },
      });
      break;
    }

    case 'createToken': {
      const ids = Array.from({ length: action.count }, newPermanentId);
      emit({ type: 'ZoneChanged', objects: ids, card: action.token, ownerId: ctx.playerId, from: 'nowhere', to: 'battlefield', how: 'token', controllerId: ctx.playerId, isToken: true });
      break;
    }

    case 'life': {
      if (!player(action.playerId)) break;
      const life = draft.players[action.playerId]!.life;
      emit({ type: 'LifeChanged', playerId: action.playerId, delta: action.delta, lifeAfter: life + action.delta, reason: action.delta >= 0 ? 'gain' : 'loss' });
      break;
    }

    case 'damage': {
      if ('permanentId' in action.recipient ? !permanent(action.recipient.permanentId) : !player(action.recipient.playerId)) break;
      const dealt = emit({ type: 'DamageDealt', damage: [{ sourceId: action.sourceId, recipient: action.recipient, amount: action.amount, combat: false }] });
      if ('playerId' in action.recipient) {
        const life = draft.players[action.recipient.playerId]!.life;
        emit(
          { type: 'LifeChanged', playerId: action.recipient.playerId, delta: -action.amount, lifeAfter: life - action.amount, reason: 'damage' },
          { gameEvent: dealt.id },
        );
      }
      break;
    }

    case 'playerTask': {
      if (!player(action.playerId)) break;
      emit({ type: 'PlayerTaskCreated', playerId: action.playerId, text: action.text });
      break;
    }

    case 'attack':
    case 'block':
    case 'noBlock':
    case 'doneAttacking':
    case 'divideDamage':
      warnings.push({ code: 'notYetSupported', message: `${action.type} is handled with combat, which isn't built yet.` });
      break;
  }

  return { state: draft, events, warnings };
}
