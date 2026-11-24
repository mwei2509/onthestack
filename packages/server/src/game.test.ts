import { LlmRequestError, parseOutput, type LlmProvider } from '@onthestack/interpreter';
import { env, runInDurableObject } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { fakeScryfall } from './cards/fake-scryfall.js';
import { createCardStore } from './cards/store.js';
import { createDeckStore } from './decks/store.js';
import type { DeviceMessage, ServerMessage } from './protocol.js';

const VONA_DECK = 'vona-deck';
const RINGS_DECK = 'rings-deck';

const VAMPIRES = { id: VONA_DECK, name: 'Vampires', commanders: ['Vona, Butcher of Magan'], colorIdentity: ['W', 'B'] };

const deckStore = (id: string) =>
  createDeckStore({
    db: env.DB,
    cards: createCardStore({ db: env.DB, fetch: fakeScryfall().fetch, sleep: async () => {}, now: () => new Date() }),
    now: () => new Date(),
    newId: () => id,
  });

beforeAll(async () => {
  await deckStore(VONA_DECK).importList('Vampires', '1x Vona, Butcher of Magan (lcc) 293 [Commander]\n1 Sol Ring');
  await deckStore(RINGS_DECK).importList('Rings', '1 Sol Ring');
});

type Update = Extract<ServerMessage, { type: 'update' }>;

async function createGame(): Promise<string> {
  const res = await exports.default.fetch('http://test/api/games', { method: 'POST' });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

async function connect(code: string) {
  const res = await exports.default.fetch(`http://test/api/games/${code}/ws`, { headers: { Upgrade: 'websocket' } });
  const ws = res.webSocket!;
  const received: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.addEventListener('message', (e) => {
    received.push(JSON.parse(e.data as string));
    waiters.shift()?.();
  });
  ws.accept();
  const next = async (): Promise<ServerMessage> => {
    if (received.length === 0) await new Promise<void>((r) => waiters.push(r));
    return received.shift()!;
  };
  const update = async (): Promise<Update> => {
    const msg = await next();
    if (msg.type !== 'update') throw new Error(`Expected an update, got ${JSON.stringify(msg)}`);
    return msg;
  };
  const send = (message: DeviceMessage | Record<string, unknown>) => ws.send(JSON.stringify(message));
  return { ws, next, update, send };
}

/** A lobby with a device per name, each joined in order. Every device has read every update. */
async function lobby(...names: string[]) {
  const code = await createGame();
  const devices = [];
  for (const name of names) {
    const device = await connect(code);
    await device.update();
    device.send({ type: 'join', name, deckId: VONA_DECK });
    devices.push(device);
    for (const d of devices) await d.update();
  }
  return { code, devices };
}

describe('Worker', () => {
  it('answers health checks', async () => {
    const res = await exports.default.fetch('http://test/api/health');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('creates games with readable codes', async () => {
    const code = await createGame();
    expect(code).toMatch(/^[A-Z]+-[A-Z]+-\d{2}$/);
    const res = await exports.default.fetch(`http://test/api/games/${code.toLowerCase()}`);
    expect(await res.json()).toEqual({ code });
  });

  it('reports codes that are not games', async () => {
    expect((await exports.default.fetch('http://test/api/games/KITE-MOSS-00')).status).toBe(404);
    expect((await exports.default.fetch('http://test/api/games/not-a-code')).status).toBe(404);
    const socket = await exports.default.fetch('http://test/api/games/KITE-MOSS-00/ws', { headers: { Upgrade: 'websocket' } });
    expect(socket.status).toBe(404);
  });

  it('rejects non-WebSocket requests to a game socket', async () => {
    const code = await createGame();
    expect((await exports.default.fetch(`http://test/api/games/${code}/ws`)).status).toBe(426);
  });
});

describe('Lobby', () => {
  it('sends an empty lobby on connect', async () => {
    const code = await createGame();
    const device = await connect(code);
    expect(await device.update()).toEqual({ type: 'update', version: 1, you: null, seats: [], started: false, view: null });
  });

  it('adds a seat per device that joins, in order, and tells each device which seat is theirs', async () => {
    const { devices } = await lobby('Theo', 'Elena');
    devices[1]!.send({ type: 'watch' });
    const [theo, elena] = [await devices[0]!.update(), await devices[1]!.update()];
    expect(theo.seats).toEqual([
      { id: 'p1', name: 'Theo', deck: VAMPIRES, connected: true },
      { id: 'p2', name: 'Elena', deck: VAMPIRES, connected: false },
    ]);
    expect(theo.you).toBe('p1');
    expect(elena.you).toBeNull();
    expect(elena.version).toBeGreaterThan(1);
  });

  it('lets anyone rename, reorder and remove seats', async () => {
    const { devices } = await lobby('Theo', 'Elena', 'Michael');
    const [theo] = devices;
    theo!.send({ type: 'editSeat', seatId: 'p2', name: '  Elle ' });
    expect((await theo!.update()).seats[1]!.name).toBe('Elle');
    theo!.send({ type: 'reorder', seatIds: ['p3', 'p1', 'p2'] });
    expect((await theo!.update()).seats.map((s) => s.id)).toEqual(['p3', 'p1', 'p2']);
    theo!.send({ type: 'removeSeat', seatId: 'p3' });
    expect((await theo!.update()).seats.map((s) => s.id)).toEqual(['p1', 'p2']);
    const michael = devices[2]!;
    await michael.update();
    await michael.update();
    expect((await michael.update()).you).toBeNull();
  });

  it('gives a reloaded device its seat back, but never takes one another device holds without takeOver', async () => {
    const { code, devices } = await lobby('Theo');
    const phone = await connect(code);
    await phone.update();
    phone.send({ type: 'claim', seatId: 'p1' });
    expect(await phone.next()).toEqual({ type: 'error', message: 'Another device has this seat' });

    phone.send({ type: 'claim', seatId: 'p1', takeOver: true });
    expect((await phone.update()).you).toBe('p1');
    expect((await devices[0]!.update()).you).toBeNull();

    phone.ws.close();
    const afterClose = await devices[0]!.update();
    expect(afterClose.seats[0]!.connected).toBe(false);
    devices[0]!.send({ type: 'claim', seatId: 'p1' });
    expect((await devices[0]!.update()).you).toBe('p1');
  });

  it('starts with the player who won the dice, then takes no new seats or seat edits', async () => {
    const { code, devices } = await lobby('Theo', 'Elena');
    devices[0]!.send({ type: 'start', firstSeatId: 'p2' });
    expect((await devices[0]!.update()).started).toBe(true);
    await devices[1]!.update();

    const late = await connect(code);
    await late.update();
    late.send({ type: 'join', name: 'Michael', deckId: VONA_DECK });
    expect(await late.next()).toEqual({ type: 'error', message: "Joining can't change once the game has started" });
    late.send({ type: 'removeSeat', seatId: 'p1' });
    expect(await late.next()).toEqual({ type: 'error', message: "Seats can't change once the game has started" });
    late.send({ type: 'claim', seatId: 'p2', takeOver: true });
    expect((await late.update()).you).toBe('p2');
  });

  it('needs a Deck from the library to take a seat (ADR 0080)', async () => {
    const code = await createGame();
    const device = await connect(code);
    await device.update();
    device.send({ type: 'join', name: 'Ana' });
    expect((await device.next()).type).toBe('error');
    device.send({ type: 'join', name: 'Ana', deckId: 'not-saved' });
    expect(await device.next()).toEqual({ type: 'error', message: "That Deck isn't saved" });
  });

  it("changes a seat's Deck, keeping a summary of it (ADR 0085)", async () => {
    const { devices } = await lobby('Theo');
    devices[0]!.send({ type: 'editSeat', seatId: 'p1', deckId: RINGS_DECK });
    expect((await devices[0]!.update()).seats[0]!.deck).toEqual({ id: RINGS_DECK, name: 'Rings', commanders: [], colorIdentity: [] });
  });

  it('reads every Deck afresh at Start, and refuses a Deck that was deleted', async () => {
    const { devices } = await lobby('Theo', 'Elena');
    devices[1]!.send({ type: 'editSeat', seatId: 'p2', deckId: RINGS_DECK });
    for (const d of devices) await d.update();
    await deckStore(RINGS_DECK).rename(RINGS_DECK, 'Rings, renamed');

    const gone = await deckStore('gone-deck').importList('Gone', '1 Sol Ring');
    devices[0]!.send({ type: 'editSeat', seatId: 'p1', deckId: gone.id });
    for (const d of devices) await d.update();
    await deckStore('gone-deck').remove(gone.id);
    devices[0]!.send({ type: 'start', firstSeatId: 'p1' });
    expect(await devices[0]!.next()).toEqual({ type: 'error', message: "Theo's Deck isn't in the library any more. Pick another." });

    devices[0]!.send({ type: 'editSeat', seatId: 'p1', deckId: VONA_DECK });
    for (const d of devices) await d.update();
    devices[0]!.send({ type: 'start', firstSeatId: 'p1' });
    const update = await devices[0]!.update();
    expect(update.seats.map((s) => s.deck?.name)).toEqual(['Vampires', 'Rings, renamed']);
    expect(update.view!.commandZone).toEqual({ p1: { card: 'Vona, Butcher of Magan', casts: 0, inZone: true }, p2: null });
  });

  it('takes at most six seats', async () => {
    const { code } = await lobby('Ana', 'Theo', 'Jun', 'Priya', 'Sam', 'Rafa');
    const seventh = await connect(code);
    await seventh.update();
    seventh.send({ type: 'join', name: 'Kim', deckId: VONA_DECK });
    expect(await seventh.next()).toEqual({ type: 'error', message: 'A game has at most 6 seats' });
  });

  it('rejects malformed and invalid messages without changing anything', async () => {
    const { devices } = await lobby('Theo');
    const [theo] = devices;
    theo!.ws.send('not json');
    expect(await theo!.next()).toEqual({ type: 'error', message: 'Messages must be JSON' });
    theo!.send({ type: 'dance' });
    expect((await theo!.next()).type).toBe('error');
    theo!.send({ type: 'join', name: '   ' });
    expect(await theo!.next()).toEqual({ type: 'error', message: 'A name is needed' });
    theo!.send({ type: 'join', name: 'Theo again', deckId: VONA_DECK });
    expect(await theo!.next()).toEqual({ type: 'error', message: 'This device already has a seat' });
    theo!.send({ type: 'reorder', seatIds: ['p1', 'p1'] });
    expect(await theo!.next()).toEqual({ type: 'error', message: 'The new order must list every seat once' });
    theo!.send({ type: 'editSeat', seatId: 'p1', deckId: 'vona' });
    expect(await theo!.next()).toEqual({ type: 'error', message: "That Deck isn't saved" });
    theo!.send({ type: 'start', firstSeatId: 'p9' });
    expect(await theo!.next()).toEqual({ type: 'error', message: 'No such seat' });
  });
});

/** A started game: Theo, Elena and Michael seated clockwise, Elena won the dice. */
async function started() {
  const { code, devices } = await lobby('Theo', 'Elena', 'Michael');
  devices[0]!.send({ type: 'start', firstSeatId: 'p2' });
  const updates = [];
  for (const d of devices) updates.push(await d.update());
  return { code, devices, view: updates[0]!.view! };
}

/** Every device's next update, all checked to be the same TableView. */
async function everyone(devices: Awaited<ReturnType<typeof connect>>[]) {
  const updates = [];
  for (const d of devices) updates.push(await d.update());
  for (const u of updates) expect(u.view).toEqual(updates[0]!.view);
  return updates[0]!.view!;
}

describe('Game', () => {
  it('starts from the seats, clockwise from whoever won the dice, in their upkeep', async () => {
    const { view } = await started();
    expect(view.turn).toEqual({ number: 1, activePlayerId: 'p2', step: 'upkeep' });
    expect(Object.values(view.players).map((p) => [p.name, p.life])).toEqual([
      ['Elena', 40],
      ['Michael', 40],
      ['Theo', 40],
    ]);
    const vona = { card: 'Vona, Butcher of Magan', casts: 0, inZone: true };
    expect(view.commandZone).toEqual({ p1: vona, p2: vona, p3: vona });
  });

  it('changes a seated device\'s own life, on every screen', async () => {
    const { code, devices } = await started();
    devices[0]!.send({ type: 'adjustLife', delta: -3 });
    expect((await everyone(devices)).players.p1!.life).toBe(37);

    const screen = await connect(code);
    expect((await screen.update()).view!.players.p1!.life).toBe(37);
    screen.send({ type: 'watch' });
    await screen.update();
    for (const d of devices) await d.update();
    screen.send({ type: 'adjustLife', delta: 1 });
    expect(await screen.next()).toEqual({ type: 'error', message: 'Only a seated device can change its life' });
  });

  it('moves to the next Step that happens, once even when two screens press together', async () => {
    const { devices } = await started();
    devices[0]!.send({ type: 'nextStep', from: 'upkeep' });
    devices[1]!.send({ type: 'nextStep', from: 'upkeep' });
    expect((await everyone(devices)).turn.step).toBe('draw');
    expect(await devices[1]!.next()).toEqual({ type: 'error', message: 'The Step has already moved on' });

    devices[1]!.send({ type: 'jumpToStep', from: 'draw', to: 'declareAttackers' });
    expect((await everyone(devices)).turn.step).toBe('declareAttackers');
    devices[1]!.send({ type: 'nextStep', from: 'declareAttackers' });
    expect((await everyone(devices)).turn.step).toBe('endOfCombat');
  });

  it('only jumps forward, to Steps that happen this turn', async () => {
    const { devices } = await started();
    devices[0]!.send({ type: 'jumpToStep', from: 'upkeep', to: 'main2' });
    await everyone(devices);
    for (const to of ['main1', 'combatDamage'] as const) {
      devices[0]!.send({ type: 'jumpToStep', from: 'main2', to });
      expect(await devices[0]!.next()).toEqual({ type: 'error', message: 'The step menu only jumps forward, to a Step that happens this turn' });
    }
  });

  it('seals the turn after cleanup and starts the next player\'s turn in their upkeep', async () => {
    const { code, devices } = await started();
    devices[1]!.send({ type: 'adjustLife', delta: 2 });
    await everyone(devices);
    devices[1]!.send({ type: 'jumpToStep', from: 'upkeep', to: 'cleanup' });
    await everyone(devices);
    devices[1]!.send({ type: 'nextStep', from: 'cleanup' });
    const view = await everyone(devices);
    expect(view.turn).toEqual({ number: 2, activePlayerId: 'p3', step: 'upkeep' });
    expect(view.players.p2!.life).toBe(42);

    devices[2]!.send({ type: 'jumpToStep', from: 'upkeep', to: 'endTurn' });
    expect((await everyone(devices)).turn).toEqual({ number: 3, activePlayerId: 'p1', step: 'upkeep' });

    await runInDurableObject(env.GAME.getByName(code), async (_game, state) => {
      const sealed = await state.storage.list({ prefix: 'sealed:' });
      expect([...sealed.keys()]).toEqual(['sealed:1', 'sealed:2']);
      expect(await state.storage.get('board')).toBeUndefined();
    });
  });

  it('gives a reconnecting device the current board and its seat back', async () => {
    const { code, devices } = await started();
    devices[2]!.send({ type: 'adjustLife', delta: -5 });
    await everyone(devices);
    devices[2]!.ws.close();
    await devices[0]!.update();
    await devices[1]!.update();

    const reloaded = await connect(code);
    const first = await reloaded.update();
    expect(first.view!.players.p3!.life).toBe(35);
    expect(first.seats[2]).toEqual({ id: 'p3', name: 'Michael', deck: VAMPIRES, connected: false });
    reloaded.send({ type: 'claim', seatId: 'p3' });
    expect((await reloaded.update()).you).toBe('p3');
  });

  it('rejects game messages before Start', async () => {
    const { devices } = await lobby('Theo');
    devices[0]!.send({ type: 'adjustLife', delta: -1 });
    expect(await devices[0]!.next()).toEqual({ type: 'error', message: "The game hasn't started yet" });
    devices[0]!.send({ type: 'adjustLife', delta: 0 });
    expect(await devices[0]!.next()).toEqual({ type: 'error', message: "A life change can't be 0" });
  });
});

interface Call {
  user: string;
  answer: (timeline: unknown) => void;
  fail: () => void;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

/**
 * Stands in for the LLM: each request waits until the test answers or fails it. Both sides poll rather than resolve
 * each other's promises, since a continuation runs in the context that resolved it and the Game object can't touch the
 * test's sockets, nor the test its storage.
 */
function fakeInterpreter() {
  const calls: Call[] = [];
  const provider: LlmProvider = {
    id: 'fake',
    async complete(request) {
      let outcome: { timeline: unknown } | 'failed' | undefined;
      calls.push({ user: request.user, answer: (timeline) => (outcome = { timeline }), fail: () => (outcome = 'failed') });
      while (!outcome) await tick();
      if (outcome === 'failed') throw new LlmRequestError('fake', 529, 'overloaded');
      const raw = JSON.stringify(outcome.timeline);
      return { output: parseOutput('fake', request.schema, raw), raw, model: 'fake', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 };
    },
  };
  const call = async (n: number): Promise<Call> => {
    while (calls.length <= n) await tick();
    return calls[n]!;
  };
  return { provider, calls, call };
}

const reading = (...from: string[]) => ({ entries: [{ step: 'upkeep', player: 'p1', action: { type: 'life', player: 'p2', delta: -3 }, from }], questions: [] });

/** A started game whose Game object interprets with the fake, without the wait between statements. */
async function interpreting() {
  const game = await started();
  const fake = fakeInterpreter();
  const stub = env.GAME.getByName(game.code);
  await runInDurableObject(stub, (instance) => {
    Object.assign(instance, { interpreter: fake.provider, interpretAfterMs: 0 });
  });
  const stored = () =>
    runInDurableObject(stub, async (_instance, state) => (await state.storage.get('turn')) as { statements: { id: string; playerId: string; text: string }[]; transcriptVersion: number; reading?: { transcriptVersion: number; timeline: unknown } });
  const say = async (device: number, text: string) => {
    game.devices[device]!.send({ type: 'statement', text });
    await everyone(game.devices);
  };
  return { ...game, ...fake, stored, say };
}

describe('Statements', () => {
  it("stores a seated device's statement as its seat's, and the reading of it (ADR 0069)", async () => {
    const { devices, call, stored, say } = await interpreting();
    await say(0, '  Elena loses 3 life ');
    const first = await call(0);
    expect(first.user).toContain('[s1] Theo (p1): "Elena loses 3 life"');

    first.answer(reading('s1'));
    await everyone(devices);
    const turn = await stored();
    expect(turn.statements).toMatchObject([{ id: 's1', playerId: 'p1', text: 'Elena loses 3 life' }]);
    expect(turn.reading).toEqual({ transcriptVersion: 1, timeline: reading('s1') });
  });

  it('takes statements only from seated devices in a started game', async () => {
    const { devices } = await lobby('Theo');
    devices[0]!.send({ type: 'statement', text: 'I play a Forest' });
    expect(await devices[0]!.next()).toEqual({ type: 'error', message: "The game hasn't started yet" });

    const game = await started();
    const screen = await connect(game.code);
    await screen.update();
    screen.send({ type: 'statement', text: 'Theo loses 3 life' });
    expect(await screen.next()).toEqual({ type: 'error', message: 'Only a seated device can say what happened' });
    game.devices[0]!.send({ type: 'statement', text: '   ' });
    expect(await game.devices[0]!.next()).toEqual({ type: 'error', message: 'Say what happened first' });
  });

  it('keeps one request in flight, then sends one more with everything said meanwhile (ADR 0017)', async () => {
    const { devices, calls, call, stored, say } = await interpreting();
    await say(0, 'Elena loses 3 life');
    const first = await call(0);
    await say(1, 'I gain 2 life');
    await say(2, 'I gain 1 life');
    expect(calls).toHaveLength(1);

    first.answer(reading('s1'));
    await everyone(devices);
    const second = await call(1);
    expect(second.user).toContain('[s3] Michael (p3): "I gain 1 life"');
    second.answer(reading('s1'));
    await everyone(devices);
    expect(calls).toHaveLength(2);
    expect((await stored()).reading?.transcriptVersion).toBe(3);
  });

  it('keeps the last reading when an interpretation fails, and retries with the next statement (ADR 0067)', async () => {
    const { devices, call, stored, say } = await interpreting();
    await say(0, 'Elena loses 3 life');
    (await call(0)).answer(reading('s1'));
    await everyone(devices);

    await say(0, 'Michael loses 2 life');
    (await call(1)).fail();
    await say(1, 'I gain 1 life');
    const retry = await call(2);
    expect(retry.user).toContain('[s2] Theo (p1): "Michael loses 2 life"');
    expect((await stored()).reading?.transcriptVersion).toBe(1);
    retry.answer(reading('s1'));
    await everyone(devices);
    expect((await stored()).reading?.transcriptVersion).toBe(3);
  });

  it('drops a reading that comes back after its turn was Sealed, then reads the new turn', async () => {
    const { devices, call, stored, say } = await interpreting();
    await say(0, 'Elena loses 3 life');
    const first = await call(0);
    devices[1]!.send({ type: 'jumpToStep', from: 'upkeep', to: 'endTurn' });
    await everyone(devices);

    await say(1, 'I play a Forest');
    first.answer(reading('s1'));
    const next = await call(1);
    expect(next.user).toContain('[s1] Elena (p2): "I play a Forest"');
    const turn = await stored();
    expect(turn.statements).toMatchObject([{ id: 's1', playerId: 'p2' }]);
    expect(turn.reading).toBeUndefined();
  });
});
