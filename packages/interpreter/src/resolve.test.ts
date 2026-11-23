import { createGame, replayTurn, type CardDefinition, type GameState } from '@onthestack/engine';
import { describe, expect, it } from 'vitest';
import { resolveTimeline } from './resolve.js';
import type { InterpretedGameAction, InterpretedTimeline, TimelineEntry } from './schema.js';

const card = (name: string, types: string[], power?: number, toughness?: number): CardDefinition => ({ name, types, power, toughness, abilities: [] });
const cards: Record<string, CardDefinition> = {
  Plains: card('Plains', ['Land']),
  'Grizzly Bears': card('Grizzly Bears', ['Creature'], 2, 2),
  Counterspell: card('Counterspell', ['Instant']),
  Murder: card('Murder', ['Instant']),
  Shock: card('Shock', ['Instant']),
};

const newGame = () =>
  createGame(
    [
      { id: 'theo', name: 'Theo' },
      { id: 'melissa', name: 'Melissa' },
    ],
    cards,
  );

let n = 0;
const said = (step: TimelineEntry['step'], player: string, action: InterpretedGameAction, response = false): TimelineEntry => ({
  step,
  player,
  action,
  from: [`s${++n}`],
  ...(response ? { response } : {}),
});
const timeline = (...entries: TimelineEntry[]): InterpretedTimeline => ({ entries, questions: [] });
const zombies = (count: number): InterpretedGameAction => ({ type: 'createToken', token: 'Zombie', count, definition: { types: ['Creature'], power: 2, toughness: 2 } });

/** A board where earlier turns already happened: the given name-based entries, replayed and taken as the new turn's start. */
function boardAfter(...entries: TimelineEntry[]): GameState {
  const start = newGame();
  const { timeline: resolved } = resolveTimeline(start, timeline(...entries));
  const state = replayTurn(start, resolved).state;
  return { ...state, turn: { ...state.turn, number: state.turn.number + 1 } };
}

describe('resolveTimeline', () => {
  it('resolves a creature cast this turn when it attacks later in the turn', () => {
    const start = newGame();
    const result = resolveTimeline(
      start,
      timeline(
        said('main1', 'theo', { type: 'cast', card: 'Grizzly Bears' }),
        said('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'grizzly bears' }, target: 'melissa' }] }),
        said('declareBlockers', 'melissa', { type: 'noBlock' }),
      ),
    );
    expect(result.questions).toEqual([]);
    const attack = result.timeline[1]?.gameAction;
    expect(attack).toMatchObject({ type: 'attack', attacks: [{ target: 'melissa' }] });
    const bears = Object.values(replayTurn(start, result.timeline, { currentStep: 'main1' }).state.permanents)[0];
    expect(attack).toEqual({ type: 'attack', attacks: [{ attackerId: bears?.id, target: 'melissa' }] });
  });

  it('places entries in Step order, whatever order the interpreter listed them in', () => {
    const result = resolveTimeline(
      newGame(),
      timeline(
        said('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Grizzly Bears' }, target: 'melissa' }] }),
        said('main1', 'theo', { type: 'cast', card: 'Grizzly Bears' }),
      ),
    );
    expect(result.questions).toEqual([]);
    expect(result.timeline.map((e) => e.step)).toEqual(['main1', 'declareAttackers']);
  });

  it('names different objects when one action names the same card twice', () => {
    const start = boardAfter(said('main1', 'theo', zombies(2)));
    const result = resolveTimeline(
      start,
      timeline(
        said('declareAttackers', 'theo', {
          type: 'attack',
          attacks: [
            { attacker: { card: 'Zombie' }, target: 'melissa' },
            { attacker: { card: 'Zombie' }, target: 'melissa' },
          ],
        }),
      ),
    );
    expect(result.questions).toEqual([]);
    const action = result.timeline[0]?.gameAction;
    if (action?.type !== 'attack') throw new Error('expected an attack');
    expect(new Set(action.attacks.map((a) => a.attackerId)).size).toBe(2);
  });

  it('treats identical copies as interchangeable instead of asking', () => {
    const start = boardAfter(said('main1', 'theo', zombies(2)));
    const result = resolveTimeline(start, timeline(said('main1', 'theo', { type: 'tap', object: { card: 'Zombie' } })));
    expect(result.questions).toEqual([]);
    expect(result.timeline).toHaveLength(1);
  });

  it('picks the only copy that can do the action (ADR 0044)', () => {
    const start = boardAfter(said('main1', 'theo', zombies(2)));
    const result = resolveTimeline(
      start,
      timeline(
        said('main1', 'theo', { type: 'tap', object: { card: 'Zombie' } }),
        said('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Zombie' }, target: 'melissa' }] }),
      ),
    );
    expect(result.questions).toEqual([]);
    const tapped = result.timeline[0]?.gameAction;
    const attack = result.timeline[1]?.gameAction;
    if (tapped?.type !== 'tap' || attack?.type !== 'attack') throw new Error('expected a tap then an attack');
    expect(attack.attacks[0]?.attackerId).not.toBe(tapped.permanentId);
  });

  it('asks which one when copies still differ, and leaves the entry out', () => {
    const start = boardAfter(said('main1', 'theo', zombies(2)));
    const someZombie = Object.values(start.permanents)[0];
    const marked: GameState = { ...start, permanents: { ...start.permanents, [someZombie!.id]: { ...someZombie!, counters: { '+1/+1': 1 } } } };
    const attack = said('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Zombie' }, target: 'melissa' }] });
    const result = resolveTimeline(marked, timeline(attack));
    expect(result.timeline).toEqual([]);
    expect(result.questions).toEqual([{ kind: 'chooseObjects', askPlayer: 'theo', text: 'Which Zombie?', about: attack.from }]);
  });

  it('asks the speaker when the named card is not on the board, and keeps resolving the rest (ADR 0044)', () => {
    const murder = said('main1', 'theo', {
      type: 'cast',
      card: 'Murder',
      targets: [{ card: 'Serra Angel', controller: 'melissa' }],
      effects: [{ type: 'move', object: { card: 'Serra Angel', controller: 'melissa' }, to: 'graveyard', how: 'destroy' }],
    });
    const result = resolveTimeline(newGame(), timeline(murder, said('main1', 'theo', { type: 'life', player: 'melissa', delta: -2 })));
    expect(result.questions).toEqual([
      { kind: 'chooseObjects', askPlayer: 'theo', text: "I don't see Serra Angel controlled by Melissa on the board. Which card did you mean?", about: murder.from },
    ]);
    expect(result.timeline).toEqual([expect.objectContaining({ gameAction: { type: 'life', playerId: 'melissa', delta: -2 } })]);
  });

  it('uses the controller to tell copies apart, and asks when it is missing', () => {
    const start = boardAfter(said('main1', 'theo', { type: 'cast', card: 'Grizzly Bears' }), said('main1', 'melissa', { type: 'cast', card: 'Grizzly Bears' }));
    const theirs = resolveTimeline(start, timeline(said('main1', 'theo', { type: 'modify', object: { card: 'Grizzly Bears', controller: 'melissa' }, power: 1, toughness: 1, until: 'endOfTurn' })));
    const melissasBears = Object.values(start.permanents).find((p) => p.controllerId === 'melissa');
    expect(theirs.timeline[0]?.gameAction).toMatchObject({ permanentId: melissasBears?.id });

    const either = resolveTimeline(start, timeline(said('main1', 'theo', { type: 'modify', object: { card: 'Grizzly Bears' }, power: 1, toughness: 1, until: 'endOfTurn' })));
    expect(either.questions).toEqual([expect.objectContaining({ kind: 'chooseObjects', text: 'Which Grizzly Bears?' })]);
  });

  it('finds a spell on the Stack for a Response that counters it', () => {
    const start = newGame();
    const result = resolveTimeline(
      start,
      timeline(
        said('main1', 'theo', { type: 'cast', card: 'Grizzly Bears' }),
        said(
          'main1',
          'melissa',
          { type: 'cast', card: 'Counterspell', targets: [{ card: 'Grizzly Bears' }], effects: [{ type: 'counter', spell: { card: 'Grizzly Bears' } }] },
          true,
        ),
      ),
    );
    expect(result.questions).toEqual([]);
    const after = replayTurn(start, result.timeline).state;
    expect(Object.values(after.permanents).some((p) => p.card === 'Grizzly Bears')).toBe(false);
    expect(after.graveyards.theo).toContain('Grizzly Bears');
  });

  it("uses a spell's own Stack item as the source of the damage it deals", () => {
    const start = boardAfter(said('main1', 'melissa', { type: 'cast', card: 'Grizzly Bears' }));
    const result = resolveTimeline(
      start,
      timeline(
        said('main1', 'theo', {
          type: 'cast',
          card: 'Shock',
          targets: [{ card: 'Grizzly Bears' }],
          effects: [{ type: 'damage', source: { card: 'Shock' }, recipient: { card: 'Grizzly Bears' }, amount: 2 }],
        }),
      ),
    );
    expect(result.questions).toEqual([]);
    const after = replayTurn(start, result.timeline).state;
    expect(after.graveyards.melissa).toContain('Grizzly Bears');
    expect(result.timeline[0]?.gameAction).toMatchObject({ effects: [{ sourceId: `k${start.nextIds.stackItem}` }] });
  });

  it('asks who is meant when a player id is unknown', () => {
    const result = resolveTimeline(newGame(), timeline(said('main1', 'theo', { type: 'life', player: 'michael', delta: -1 })));
    expect(result.questions).toEqual([expect.objectContaining({ kind: 'choosePlayers', askPlayer: 'theo' })]);
  });

  it("keeps the interpreter's own questions and doesn't repeat one the resolver would ask", () => {
    const attack = said('declareAttackers', 'theo', { type: 'attack', attacks: [{ attacker: { card: 'Serra Angel' }, target: 'melissa' }] });
    const own = { kind: 'chooseObjects' as const, askPlayer: 'theo', text: 'Did you say Serra Angel?', about: attack.from };
    const result = resolveTimeline(newGame(), { entries: [attack], questions: [own] });
    expect(result.questions).toEqual([own]);
  });
});
