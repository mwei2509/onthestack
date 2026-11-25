import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import type { GameAction } from './actions.js';
import type { CardDefinition } from './cards.js';
import { createGame } from './game.js';
import type { GameState } from './state.js';
import type { Step } from './steps.js';
import type { TimelineEntry } from './timeline.js';
import { applyBoardCorrection, replayTurn, sealTurn, stepsAhead, tableView } from './turn.js';

const card = (name: string, types: string[], power?: number, toughness?: number, keywords: string[] = []): CardDefinition => ({ name, types, power, toughness, keywords, abilities: [] });

// The example game's cards (docs/engine-model.md section 11), M1 style: no Translations, so players state effects.
const cards: Record<string, CardDefinition> = {
  'Caves of Koilos': card('Caves of Koilos', ['Land']),
  Plains: card('Plains', ['Land']),
  Mountain: card('Mountain', ['Land']),
  'Starting Town': card('Starting Town', ['Land']),
  'Scoured Barrens': card('Scoured Barrens', ['Land']),
  'Hinterland Sanctifier': card('Hinterland Sanctifier', ['Creature'], 1, 2),
  'Haliya, Guided by Light': { ...card('Haliya, Guided by Light', ['Creature'], 3, 3), legendary: true },
  'Raging Goblin': card('Raging Goblin', ['Creature'], 1, 1, ['Haste']),
  'Goblin Guide': card('Goblin Guide', ['Creature'], 2, 2, ['Haste']),
  'Savannah Lions': card('Savannah Lions', ['Creature'], 2, 1),
  'Case of the Uneaten Feast': card('Case of the Uneaten Feast', ['Enchantment']),
  'Authority of the Consuls': card('Authority of the Consuls', ['Enchantment']),
  'Fatal Push': card('Fatal Push', ['Instant']),
  Disenchant: card('Disenchant', ['Instant']),
  'Teysa Karlov': { ...card('Teysa Karlov', ['Creature'], 2, 4), legendary: true },
  'Krenko, Mob Boss': { ...card('Krenko, Mob Boss', ['Creature'], 3, 3), legendary: true },
  'Amalia Benavides Aguirre': { ...card('Amalia Benavides Aguirre', ['Creature'], 2, 2), legendary: true },
  "Sythis, Harvest's Hand": { ...card("Sythis, Harvest's Hand", ['Enchantment', 'Creature'], 1, 2), legendary: true },
  'Grizzly Bears': card('Grizzly Bears', ['Creature'], 2, 2),
  Counterspell: card('Counterspell', ['Instant']),
};

const newGame = () =>
  createGame(
    [
      { id: 'theo', name: 'Theo', commander: 'Teysa Karlov' },
      { id: 'michael', name: 'Michael', commander: 'Krenko, Mob Boss' },
      { id: 'melissa', name: 'Melissa', commander: 'Amalia Benavides Aguirre' },
      { id: 'elena', name: 'Elena', commander: "Sythis, Harvest's Hand" },
    ],
    cards,
  );

let statement = 0;
const e = (step: Step, playerId: string, gameAction: GameAction, response = false): TimelineEntry => ({
  step,
  playerId,
  gameAction,
  from: [`s${++statement}`],
  ...(response ? { response } : {}),
});
const destroy = (objectId: string): GameAction => ({ type: 'move', objectId, to: 'graveyard', how: 'destroy' });

describe('the example game (docs/engine-model.md section 11), M1 timelines', () => {
  const turns: TimelineEntry[][] = [
    // R1 Theo
    [e('main1', 'theo', { type: 'playLand', card: 'Caves of Koilos' }), e('main1', 'theo', { type: 'damage', sourceId: 'p1', recipient: { playerId: 'theo' }, amount: 1 }), e('main1', 'theo', { type: 'cast', card: 'Hinterland Sanctifier' })],
    // R1 Michael
    [e('main1', 'michael', { type: 'playLand', card: 'Mountain' }), e('main1', 'michael', { type: 'cast', card: 'Raging Goblin' }), e('declareAttackers', 'michael', { type: 'attack', attacks: [{ attackerId: 'p4', target: 'theo' }] }), e('declareBlockers', 'theo', { type: 'noBlock' })],
    // R1 Melissa
    [e('main1', 'melissa', { type: 'playLand', card: 'Starting Town' })],
    // R1 Elena
    [e('main1', 'elena', { type: 'playLand', card: 'Plains' }), e('main1', 'elena', { type: 'cast', card: 'Case of the Uneaten Feast' })],
    // R2 Theo: Haliya warped in; in M1 Theo says the two triggered life gains; warp exiles her at the end step
    [
      e('main1', 'theo', { type: 'playLand', card: 'Plains' }),
      e('main1', 'theo', { type: 'cast', card: 'Haliya, Guided by Light' }),
      e('main1', 'theo', { type: 'life', playerId: 'theo', delta: 1 }),
      e('main1', 'theo', { type: 'life', playerId: 'theo', delta: 1 }),
      e('declareAttackers', 'theo', { type: 'attack', attacks: [{ attackerId: 'p2', target: 'michael' }] }),
      e('declareBlockers', 'michael', { type: 'noBlock' }),
      e('end', 'theo', { type: 'move', objectId: 'p9', to: 'exile' }),
    ],
    // R2 Michael: Theo pays 1 from Caves and Fatal Pushes Goblin Guide during declare attackers
    [
      e('main1', 'michael', { type: 'playLand', card: 'Mountain' }),
      e('main1', 'michael', { type: 'cast', card: 'Goblin Guide' }),
      e('declareAttackers', 'michael', { type: 'attack', attacks: [{ attackerId: 'p11', target: 'theo' }, { attackerId: 'p4', target: 'theo' }] }),
      e('declareAttackers', 'theo', { type: 'playerTask', playerId: 'theo', text: 'Goblin Guide: reveal the top card of your library' }),
      e('declareAttackers', 'theo', { type: 'damage', sourceId: 'p1', recipient: { playerId: 'theo' }, amount: 1 }),
      e('declareAttackers', 'theo', { type: 'cast', card: 'Fatal Push', targets: ['p11'], effects: [destroy('p11')] }),
      e('declareBlockers', 'theo', { type: 'noBlock' }),
    ],
    // R2 Melissa: Scoured Barrens' gain and Starting Town's payment are said
    [
      e('main1', 'melissa', { type: 'playLand', card: 'Scoured Barrens' }),
      e('main1', 'melissa', { type: 'life', playerId: 'melissa', delta: 1 }),
      e('main1', 'melissa', { type: 'life', playerId: 'melissa', delta: -1 }),
      e('main1', 'melissa', { type: 'cast', card: 'Authority of the Consuls' }),
    ],
    // R2 Elena: Authority and Case gains are said by their controllers
    [
      e('main1', 'elena', { type: 'playLand', card: 'Plains' }),
      e('main1', 'elena', { type: 'cast', card: 'Savannah Lions' }),
      e('main1', 'melissa', { type: 'life', playerId: 'melissa', delta: 1 }),
      e('main1', 'elena', { type: 'life', playerId: 'elena', delta: 1 }),
    ],
  ];
  // R3 Theo, in progress: main 1, then Hinterland Sanctifier attacks Melissa.
  const now: TimelineEntry[] = [
    e('main1', 'theo', { type: 'playLand', card: 'Plains' }),
    e('main1', 'theo', { type: 'cast', card: 'Disenchant', targets: ['p13'], effects: [destroy('p13')] }),
    e('declareAttackers', 'theo', { type: 'attack', attacks: [{ attackerId: 'p2', target: 'melissa' }] }),
  ];

  let turnStart = newGame();
  const sealed = turns.map((timeline) => {
    const r = sealTurn(turnStart, timeline);
    turnStart = r.nextTurnStart;
    return r;
  });
  const result = replayTurn(turnStart, now);
  const view = tableView(result);

  it('reaches Theo’s combat in round 3 with the right life totals', () => {
    expect(result.state.turn).toEqual({ number: 9, activePlayerId: 'theo', step: 'declareAttackers' });
    expect(Object.fromEntries(Object.values(result.state.players).map((p) => [p.id, p.life]))).toEqual({ theo: 38, michael: 39, melissa: 41, elena: 41 });
  });

  it('has the right cards in every zone', () => {
    expect(result.state.graveyards).toEqual({ theo: ['Fatal Push', 'Disenchant'], michael: ['Goblin Guide'], melissa: ['Authority of the Consuls'], elena: [] });
    expect(result.state.exile).toEqual([{ card: 'Haliya, Guided by Light', ownerId: 'theo' }]);
    const battlefield = Object.values(result.state.permanents).map((p) => `${p.controllerId}:${p.card}`).sort();
    expect(battlefield).toEqual([
      'elena:Case of the Uneaten Feast', 'elena:Plains', 'elena:Plains', 'elena:Savannah Lions',
      'melissa:Scoured Barrens', 'melissa:Starting Town',
      'michael:Mountain', 'michael:Mountain', 'michael:Raging Goblin',
      'theo:Caves of Koilos', 'theo:Hinterland Sanctifier', 'theo:Plains', 'theo:Plains',
    ]);
  });

  it('shows Melissa still to respond, with the attacker tapped and no warnings all game', () => {
    expect(view.awaitingResponseFrom).toEqual(['melissa']);
    expect(view.combatPreview).toBeNull();
    expect(view.permanents.find((p) => p.card === 'Hinterland Sanctifier')).toMatchObject({ tapped: true, power: 1, toughness: 2 });
    expect([...sealed.flatMap((s) => s.warnings), ...result.warnings]).toEqual([]);
  });

  it('previews 1 damage to Melissa once she takes it', () => {
    const answered = tableView(replayTurn(turnStart, [...now, e('declareBlockers', 'melissa', { type: 'noBlock' })], { currentStep: 'declareBlockers' }));
    expect(answered.awaitingResponseFrom).toEqual([]);
    expect(answered.combatPreview?.find((x) => x.type === 'LifeChanged')).toMatchObject({ playerId: 'melissa', delta: -1, lifeAfter: 40 });
  });

  it('keeps each sealed turn’s GameEvents and a life summary', () => {
    expect(sealed[5]!.sealed.summary).toEqual({ theo: { lifeChange: -2 }, michael: { lifeChange: 0 }, melissa: { lifeChange: 0 }, elena: { lifeChange: 0 } });
    const events = sealed[5]!.sealed.gameEvents;
    const cast = events.find((x) => x.type === 'SpellCast' && x.card === 'Fatal Push');
    const died = events.find((x) => x.type === 'ZoneChanged' && x.to === 'graveyard' && x.moves.some((m) => m.card === 'Goblin Guide'));
    expect(cast?.type === 'SpellCast' && died?.causedBy).toEqual({ stackItem: cast?.type === 'SpellCast' ? cast.stackItemId : '', gameAction: 0 });
  });
});

describe('replayTurn', () => {
  const twoBears = (): GameState => {
    let s = newGame();
    s = sealTurn(s, [e('main1', 'theo', { type: 'cast', card: 'Grizzly Bears' })]).nextTurnStart;
    return s;
  };

  it('untaps only the active player’s permanents and shows the draw as a reminder, not a task (ADR 0028)', () => {
    const start = twoBears();
    start.permanents.p1!.tapped = true;
    const r = replayTurn(start, [], { currentStep: 'draw' });
    expect(r.state.permanents.p1!.tapped).toBe(true);
    expect(tableView(r).reminders).toEqual([{ text: 'Draw a card', playerId: 'michael' }]);
    expect(tableView(r).playerTasks).toEqual([]);
  });

  it('cleanup lists what it ended: damage, end-of-turn effects, borrowed creatures (ADR 0021)', () => {
    const start = twoBears();
    const r = sealTurn(start, [
      e('main1', 'michael', { type: 'gainControl', permanentId: 'p1', until: 'endOfTurn' }),
      e('main1', 'michael', { type: 'modify', permanentId: 'p1', power: 2, toughness: 2, until: 'endOfTurn' }),
      e('main1', 'elena', { type: 'damage', sourceId: 'k0', recipient: { permanentId: 'p1' }, amount: 1 }),
    ]);
    const cleaned = r.sealed.gameEvents.find((x) => x.type === 'CleanedUp');
    expect(cleaned).toMatchObject({
      damageRemoved: [{ permanentId: 'p1', amount: 1 }],
      effectsEnded: [{ permanentId: 'p1' }],
      controlReturned: [{ permanentId: 'p1', to: 'theo' }],
    });
  });

  it('cleanup removes damage and end-of-turn effects and returns borrowed creatures', () => {
    const start = twoBears();
    const r = sealTurn(start, [
      e('main1', 'michael', { type: 'gainControl', permanentId: 'p1', until: 'endOfTurn' }),
      e('main1', 'michael', { type: 'modify', permanentId: 'p1', power: 2, toughness: 2, until: 'endOfTurn' }),
      e('main1', 'elena', { type: 'damage', sourceId: 'k0', recipient: { permanentId: 'p1' }, amount: 1 }),
    ]);
    expect(r.sealed.finalBoard.permanents.p1).toMatchObject({ controllerId: 'theo', damage: 0, effects: [] });
  });

  it('waits for a Response before resolving: "in response, Counterspell" counters the creature', () => {
    const r = replayTurn(newGame(), [
      e('main1', 'theo', { type: 'cast', card: 'Grizzly Bears' }),
      e('main1', 'melissa', { type: 'cast', card: 'Counterspell', targets: ['k1'], effects: [{ type: 'counter', stackItemId: 'k1' }] }, true),
    ]);
    expect(r.state.permanents).toEqual({});
    expect(r.state.graveyards.theo).toEqual(['Grizzly Bears']);
  });

  it('without the Response flag, the creature resolves first and the counter has nothing to hit', () => {
    const r = replayTurn(newGame(), [
      e('main1', 'theo', { type: 'cast', card: 'Grizzly Bears' }),
      e('main1', 'melissa', { type: 'cast', card: 'Counterspell', targets: ['k1'], effects: [{ type: 'counter', stackItemId: 'k1' }] }),
    ]);
    expect(Object.values(r.state.permanents).map((p) => p.card)).toEqual(['Grizzly Bears']);
  });

  it('a board correction is recorded as a pair: a TableEvent and the GameEvents it produced (ADR 0020, 0034)', () => {
    const start = twoBears();
    const r = applyBoardCorrection(start, { type: 'counters', target: { permanentId: 'p1' }, kind: '+1/+1', delta: 2 }, 'melissa');
    expect(r.tableEvents).toEqual([
      { id: 't1', type: 'BoardCorrectionMade', playerId: 'melissa', gameAction: { type: 'counters', target: { permanentId: 'p1' }, kind: '+1/+1', delta: 2 }, gameEvents: r.events.map((x) => x.id), causedBy: { rule: 'boardCorrection' } },
    ]);
    expect(r.events.map((x) => x.type)).toEqual(['CountersChanged']);
  });

  it('TableEvents are numbered in replay order, the same every time', () => {
    const timeline = [e('main1', 'theo', { type: 'playerTask', playerId: 'michael', text: 'Reveal your top card' })];
    const a = replayTurn(newGame(), timeline);
    expect(a.tableEvents.map((t) => [t.id, t.type, t.type === 'PlayerTaskCreated' ? t.text : ''])).toEqual([['t1', 'PlayerTaskCreated', 'Reveal your top card']]);
    expect(replayTurn(newGame(), timeline).tableEvents).toEqual(a.tableEvents);
  });

  it('a board correction changes the board, is caused by the correction, and settles', () => {
    const start = twoBears();
    const r = applyBoardCorrection(start, { type: 'counters', target: { permanentId: 'p1' }, kind: '-1/-1', delta: 2 }, 'theo');
    expect(r.events[0]!.causedBy).toEqual({ rule: 'boardCorrection' });
    expect(r.state.permanents.p1).toBeUndefined();
  });

  it('sealing through a Step stops there: ending mid-turn runs no cleanup (ADR 0100)', () => {
    const timeline = [
      e('main1', 'michael', { type: 'modify', permanentId: 'p1', power: 2, toughness: 2, until: 'endOfTurn' }),
      e('main1', 'elena', { type: 'damage', sourceId: 'k0', recipient: { permanentId: 'p1' }, amount: 1 }),
    ];
    const r = sealTurn(twoBears(), timeline, { through: 'main1' });
    expect(r.sealed.finalBoard.turn.step).toBe('main1');
    expect(r.sealed.finalBoard.permanents.p1).toMatchObject({ damage: 1, effects: [{ until: 'endOfTurn' }] });
    expect(r.sealed.gameEvents.some((x) => x.type === 'CleanedUp')).toBe(false);
    expect(r.sealed.finalBoard).toEqual(replayTurn(twoBears(), timeline, { currentStep: 'main1' }).state);
  });

  it('sealing passes the turn to the next player still in the game', () => {
    const s = newGame();
    s.players.michael!.out = true;
    expect(sealTurn(s, []).nextTurnStart.turn).toEqual({ number: 2, activePlayerId: 'melissa', step: 'untap' });
  });
});

const entry = fc.record({
  step: fc.constantFrom<Step>('main1', 'declareAttackers', 'declareBlockers', 'main2', 'end'),
  player: fc.constantFrom('theo', 'michael', 'melissa'),
  kind: fc.constantFrom('creature', 'life', 'shrink', 'attack', 'noBlock'),
  n: fc.integer({ min: 1, max: 5 }),
});

describe('stepsAhead', () => {
  const at = (state: GameState, step: Step) => ({ ...state, turn: { ...state.turn, step } });

  it('skips blockers and combat damage when nobody attacks, and ends with cleanup', () => {
    expect(stepsAhead(at(newGame(), 'main1'))).toEqual(['beginningOfCombat', 'declareAttackers', 'endOfCombat', 'main2', 'end', 'cleanup']);
    expect(stepsAhead(at(newGame(), 'cleanup'))).toEqual([]);
    expect(tableView(replayTurn(newGame(), [], { currentStep: 'end' })).stepsAhead).toEqual(['cleanup']);
  });

  it('keeps combat damage once there are attackers, and first-strike damage only for first strikers', () => {
    const timeline: TimelineEntry[] = [
      { step: 'main1', playerId: 'theo', gameAction: { type: 'cast', card: 'Grizzly Bears' }, from: [] },
    ];
    const withBears = replayTurn(newGame(), timeline).state;
    const bears = Object.values(withBears.permanents)[0]!;
    const attacking = { ...at(withBears, 'declareAttackers'), combat: { attacks: [{ attackerId: bears.id, target: 'elena' }], blocks: [], ready: [], divisions: {} } };
    expect(stepsAhead(attacking)).toEqual(['declareBlockers', 'combatDamage', 'endOfCombat', 'main2', 'end', 'cleanup']);
  });
});

describe('replay properties', () => {
  test.prop([fc.array(entry, { maxLength: 15 })])('replaying is deterministic, and a sealed turn leaves a clean board for the next', (raw) => {
    const timeline: TimelineEntry[] = raw.map((r, i) => ({
      step: r.step,
      playerId: r.player,
      from: [`s${i}`],
      gameAction: {
        creature: { type: 'cast', card: 'Grizzly Bears' },
        life: { type: 'life', playerId: r.player, delta: -r.n },
        shrink: { type: 'modify', permanentId: `p${r.n}`, power: -1, toughness: -1, until: 'endOfTurn' },
        attack: { type: 'attack', attacks: [{ attackerId: `p${r.n}`, target: 'melissa' }] },
        noBlock: { type: 'noBlock' },
      }[r.kind] as GameAction,
    }));
    expect(replayTurn(newGame(), timeline)).toEqual(replayTurn(newGame(), timeline));
    const { nextTurnStart } = sealTurn(newGame(), timeline);
    expect(nextTurnStart.stack).toEqual([]);
    expect(nextTurnStart.pendingTriggers).toEqual([]);
    expect(nextTurnStart.combat).toBeNull();
    for (const p of Object.values(nextTurnStart.permanents)) {
      expect(p.damage).toBe(0);
      expect(p.effects.filter((x) => x.until === 'endOfTurn')).toEqual([]);
    }
  });
});

describe('replayTurn with a Response pending', () => {
  it('leaves the last spell on the Stack instead of resolving it', () => {
    const cast: TimelineEntry = { step: 'main1', playerId: 'theo', gameAction: { type: 'cast', card: 'Grizzly Bears' }, from: ['s1'] };
    const held = replayTurn(newGame(), [cast], { currentStep: 'main1', responsePending: true }).state;
    expect(held.stack.map((k) => [k.source.card, k.status])).toEqual([['Grizzly Bears', 'pending']]);
    expect(Object.values(held.permanents)).toEqual([]);

    const resolved = replayTurn(newGame(), [cast], { currentStep: 'main1' }).state;
    expect(Object.values(resolved.permanents).map((p) => p.card)).toEqual(['Grizzly Bears']);
  });
});

describe('RulesWarnings and PlayerTasks across re-reads (ADR 0122, 0123, 0125)', () => {
  const castAndAttack = () => {
    const cast = e('main1', 'theo', { type: 'cast', card: 'Grizzly Bears' });
    const attack = e('declareAttackers', 'theo', { type: 'attack', attacks: [{ attackerId: 'p1', target: 'michael' }] });
    return { cast, attack, timeline: [cast, attack] };
  };

  it('tags a warning with the timeline entry that raised it', () => {
    const { attack, timeline } = castAndAttack();
    const sick = replayTurn(newGame(), timeline).warnings.find((w) => w.code === 'summoningSickness');
    expect(sick?.entry).toEqual({ step: 'declareAttackers', playerId: 'theo', from: attack.from });
  });

  it('"Do it anyway" marks the matching warning and records who chose it', () => {
    const { attack, timeline } = castAndAttack();
    const r = replayTurn(newGame(), timeline, { overrides: [{ code: 'summoningSickness', from: attack.from, objectIds: ['p1'], playerId: 'michael' }] });
    expect(r.warnings.find((w) => w.code === 'summoningSickness')?.overriddenBy).toBe('michael');
    expect(r.tableEvents).toContainEqual(expect.objectContaining({ type: 'WarningOverridden', code: 'summoningSickness', objectIds: ['p1'], playerId: 'michael' }));
  });

  it('an override from other statements, about other objects or of another code does not match', () => {
    const { attack, timeline } = castAndAttack();
    const overrides = [
      { code: 'summoningSickness' as const, from: ['s999'], objectIds: ['p1'], playerId: 'michael' },
      { code: 'summoningSickness' as const, from: attack.from, objectIds: ['p2'], playerId: 'michael' },
      { code: 'tapped' as const, from: attack.from, objectIds: ['p1'], playerId: 'michael' },
    ];
    const r = replayTurn(newGame(), timeline, { overrides });
    expect(r.warnings.find((w) => w.code === 'summoningSickness')?.overriddenBy).toBeUndefined();
    expect(r.tableEvents.map((t) => t.type)).not.toContain('WarningOverridden');
  });

  it('sealing keeps the override in the sealed record', () => {
    const { attack, timeline } = castAndAttack();
    const { sealed, warnings } = sealTurn(newGame(), timeline, { overrides: [{ code: 'summoningSickness', from: attack.from, objectIds: ['p1'], playerId: 'theo' }] });
    expect(warnings.find((w) => w.code === 'summoningSickness')?.overriddenBy).toBe('theo');
    expect(sealed.tableEvents.map((t) => t.type)).toContain('WarningOverridden');
  });

  it('a PlayerTask carries the statements that set it off, and a done mark matches only that task', () => {
    const first = e('main1', 'theo', { type: 'playerTask', playerId: 'michael', text: 'Reveal your top card' });
    const second = e('main1', 'theo', { type: 'playerTask', playerId: 'michael', text: 'Reveal your top card' });
    const r = replayTurn(newGame(), [first, second], { doneTasks: [{ playerId: 'michael', text: 'Reveal your top card', from: second.from, doneBy: 'michael' }] });
    expect(tableView(r).playerTasks).toEqual([
      { id: 't1', playerId: 'michael', text: 'Reveal your top card', from: first.from },
      { id: 't2', playerId: 'michael', text: 'Reveal your top card', from: second.from, doneBy: 'michael' },
    ]);
    expect(r.tableEvents.map((t) => t.type)).toEqual(['PlayerTaskCreated', 'PlayerTaskCreated', 'PlayerTaskDone']);
  });
});
