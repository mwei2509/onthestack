import { LlmRequestError, parseOutput, type LlmProvider } from '@onthestack/interpreter';
import { env, runInDurableObject } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { refuseDump } from './index.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { fakeScryfall } from './cards/fake-scryfall.js';
import { createCardStore } from './cards/store.js';
import { createDeckStore } from './decks/store.js';
import { Game } from './game.js';
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

describe('Join codes (ADR 0095)', () => {
  const join = (digits: string, ip = '203.0.113.1') => exports.default.fetch(`http://test/api/join/${digits}`, { headers: { 'CF-Connecting-IP': ip } });

  it('gives each new game a six-digit join code that finds it, shown to every device', async () => {
    const res = await exports.default.fetch('http://test/api/games', { method: 'POST' });
    const { code, joinCode } = (await res.json()) as { code: string; joinCode: string };
    expect(joinCode).toMatch(/^\d{6}$/);
    expect(await (await join(joinCode, '203.0.113.2')).json()).toEqual({ code });
    const device = await connect(code);
    expect((await device.update()).joinCode).toBe(joinCode);
  });

  it('answers 404 for a code that is not a game', async () => {
    await env.DB.prepare("DELETE FROM join_codes WHERE code = '000000'").run();
    const res = await join('000000', '203.0.113.3');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'No game with that code' });
    expect((await join('12345', '203.0.113.3')).status).toBe(404);
  });

  it('slows down anyone trying lots of codes', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await join(String(100000 + i), '198.51.100.9')).status);
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses.at(-1)).toBe(429);
    expect((await join('100000', '198.51.100.10')).status).not.toBe(429);
  });
});

describe('Worker', () => {
  it('answers health checks', async () => {
    const res = await exports.default.fetch('http://test/api/health');
    expect(await res.json()).toEqual({ ok: true, testPhase: false });
  });

  it('creates games with readable codes', async () => {
    const code = await createGame();
    expect(code).toMatch(/^[A-Z]+-[A-Z]+-\d{2}$/);
    const res = await exports.default.fetch(`http://test/api/games/${code.toLowerCase()}`);
    expect(await res.json()).toEqual({ code, status: 'lobby', turn: null });
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
    expect(await device.update()).toEqual({ type: 'update', version: 1, you: null, seats: [], started: false, ended: null, joinCode: expect.stringMatching(/^\d{6}$/), view: null, log: null });
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
  it('says a started game is playing, and in which turn (ADR 0111)', async () => {
    const { code } = await started();
    const res = await exports.default.fetch(`http://test/api/games/${code}`);
    expect(await res.json()).toEqual({ code, status: 'playing', turn: 1 });
  });

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

describe('Debug dump (ADR 0117)', () => {
  it('returns the whole game: setup, sealed turns, the current turn with its board, and interpretations', async () => {
    const { code, devices, call, say } = await interpreting();
    await say(0, 'Elena loses 3 life');
    (await call(0)).answer(reading('s1'));
    await everyone(devices);
    devices[1]!.send({ type: 'jumpToStep', from: 'upkeep', to: 'endTurn' });
    await everyone(devices);
    await say(1, 'I gain 2 life');

    const res = await exports.default.fetch(`http://localhost/api/games/${code}/debug`);
    expect(res.status).toBe(200);
    const dump = (await res.json()) as {
      code: string;
      setup: { seats: { name: string }[] };
      sealedTurns: { statements: { text: string }[] }[];
      currentTurn: { number: number; statements: { text: string }[]; board: { summary: { life: Record<string, number> } } };
      interpretations: unknown[];
    };
    expect(dump.code).toBe(code);
    expect(dump.setup.seats.map((s) => s.name)).toEqual(['Theo', 'Elena', 'Michael']);
    expect(dump.sealedTurns).toHaveLength(1);
    expect(dump.sealedTurns[0]!.statements).toMatchObject([{ text: 'Elena loses 3 life' }]);
    expect(dump.currentTurn.number).toBe(2);
    expect(dump.currentTurn.statements).toMatchObject([{ text: 'I gain 2 life' }]);
    expect(dump.currentTurn.board.summary.life).toMatchObject({ p2: 37 });
    expect(dump.interpretations).toHaveLength(1);
  });

  it('is a 404 for a code that is no game', async () => {
    expect((await exports.default.fetch('http://localhost/api/games/KITE-MOSS-00/debug')).status).toBe(404);
  });
});

describe('Reports (ADR 0118)', () => {
  it("saves what a seat expected with the game as it is now, during the test phase", async () => {
    const { code, devices } = await started();
    await runInDurableObject(env.GAME.getByName(code), (instance) => {
      Object.assign(instance, { env: { ...(instance as unknown as { env: Env }).env, TEST_PHASE: 'true' } });
    });
    devices[0]!.send({ type: 'adjustLife', delta: -2 });
    await everyone(devices);
    devices[0]!.send({ type: 'report', text: 'I would have expected Hinterland Sanctifier to gain me life' });
    const reply = await devices[0]!.next();
    if (reply.type !== 'reported') throw new Error(`Expected reported, got ${JSON.stringify(reply)}`);

    const row = await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(reply.id).first<Record<string, unknown>>();
    expect(row).toMatchObject({ game_code: code, turn: 1, step: 'upkeep', reporter_seat: 'p1', reporter_name: 'Theo', text: 'I would have expected Hinterland Sanctifier to gain me life', dump_trimmed: 0 });
    const dump = JSON.parse(row!.dump as string) as { currentTurn: { board: { summary: { life: Record<string, number> } } } };
    expect(dump.currentTurn.board.summary.life.p1).toBe(38);
  });

  it('takes no reports outside the test phase', async () => {
    const { devices } = await started();
    devices[0]!.send({ type: 'report', text: 'Something looks off' });
    expect(await devices[0]!.next()).toEqual({ type: 'error', message: 'Reports are only taken during the test phase' });
  });
});

describe('Who may read a dump', () => {
  const env = (DEBUG_TOKEN?: string, LOCAL_DEV?: string) => ({ DEBUG_TOKEN, LOCAL_DEV });
  const get = (url: string, token?: string) => new Request(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

  it('without the secret, serves only local development and Previews', () => {
    expect(refuseDump(get('https://onthestack.gg/api/games/X/debug'), env(undefined, 'true'))).toBeNull();
    expect(refuseDump(get('https://pr-12-onthestack.onthestack.workers.dev/api/games/X/debug'), env())).toBeNull();
    expect(refuseDump(get('https://onthestack.gg/api/games/X/debug'), env())?.status).toBe(403);
  });

  it('with the secret, needs the token everywhere', () => {
    expect(refuseDump(get('https://onthestack.gg/api/games/X/debug', 's3cret'), env('s3cret'))).toBeNull();
    expect(refuseDump(get('https://onthestack.gg/api/games/X/debug', 'guess'), env('s3cret'))?.status).toBe(401);
    expect(refuseDump(get('https://onthestack.gg/api/games/X/debug'), env('s3cret', 'true'))?.status).toBe(401);
  });
});

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
    expect(await screen.next()).toEqual({ type: 'error', message: 'Say whose statement this is' });
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
    await everyone(devices);
    await say(1, 'I gain 1 life');
    const retry = await call(2);
    expect(retry.user).toContain('[s2] Theo (p1): "Michael loses 2 life"');
    expect((await stored()).reading?.transcriptVersion).toBe(1);
    retry.answer(reading('s1'));
    await everyone(devices);
    expect((await stored()).reading?.transcriptVersion).toBe(3);
  });

  it('keeps the question an answer was given to (ADR 0114)', async () => {
    const { call, stored, devices } = await interpreting();
    devices[0]!.send({ type: 'statement', text: 'Yes', answering: 'Did you play a second Godless Shrine?' });
    await everyone(devices);
    expect((await call(0)).user).toContain('answering "Did you play a second Godless Shrine?": "Yes"');
    expect((await stored()).statements).toMatchObject([{ id: 's1', text: 'Yes', answering: 'Did you play a second Godless Shrine?' }]);
  });

  it('keeps the last interpretations, newest first, for any device that asks (ADR 0109)', async () => {
    const { code, devices, call, say } = await interpreting();
    await say(0, 'Elena loses 3 life');
    (await call(0)).answer(reading('s1'));
    await everyone(devices);
    await say(1, 'I gain 1 life');
    (await call(1)).fail();
    await everyone(devices);

    const screen = await connect(code);
    await screen.update();
    screen.send({ type: 'debugLog' });
    const log = await screen.next();
    if (log.type !== 'debugLog') throw new Error(`Expected the debug log, got ${log.type}`);
    expect(log.interpretations).toHaveLength(2);
    const [failed, read] = log.interpretations;
    expect(failed).toMatchObject({ turn: 1, transcriptVersion: 2, provider: 'fake', error: expect.stringContaining('overloaded') });
    expect(failed!.user).toContain('[s2] Elena (p2): "I gain 1 life"');
    expect(read).toMatchObject({ turn: 1, transcriptVersion: 1, model: 'fake', answer: JSON.stringify(reading('s1')), promptVersion: expect.stringMatching(/^[0-9a-f]{8}$/) });
  });

  it('records an interpretation that never reached a provider, such as a missing API key', async () => {
    const { code, devices } = await started();
    const stub = env.GAME.getByName(code);
    await runInDurableObject(stub, (instance) => {
      Object.assign(instance, { interpretAfterMs: 0 });
    });
    devices[0]!.send({ type: 'statement', text: 'Elena loses 3 life' });
    await everyone(devices);
    await everyone(devices);
    const screen = await connect(code);
    await screen.update();
    screen.send({ type: 'debugLog' });
    const log = await screen.next();
    if (log.type !== 'debugLog') throw new Error(`Expected the debug log, got ${log.type}`);
    expect(log.interpretations).toMatchObject([{ provider: 'none', error: expect.stringContaining('ANTHROPIC_API_KEY') }]);
  });

  it('keeps no more than the last 10 interpretations', async () => {
    const { code, devices, call, say } = await interpreting();
    for (let i = 0; i < 12; i++) {
      await say(0, `Elena loses ${i + 1} life`);
      (await call(i)).answer(reading('s1'));
      await everyone(devices);
    }
    const screen = await connect(code);
    await screen.update();
    screen.send({ type: 'debugLog' });
    const log = await screen.next();
    if (log.type !== 'debugLog') throw new Error(`Expected the debug log, got ${log.type}`);
    expect(log.interpretations.map((r) => r.transcriptVersion)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
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

describe('Ending a game (ADR 0100, 0101)', () => {
  const join = (digits: string) => exports.default.fetch(`http://test/api/join/${digits}`, { headers: { 'CF-Connecting-IP': '203.0.113.9' } });

  it('seals the turn where the table is, freezes the board for everyone and retires the join code', async () => {
    const { code, devices } = await started();
    const joinCode = (await (await connect(code)).update()).joinCode!;
    devices[1]!.send({ type: 'adjustLife', delta: 2 });
    await everyone(devices);
    devices[1]!.send({ type: 'jumpToStep', from: 'upkeep', to: 'draw' });
    expect((await everyone(devices)).reminders).not.toEqual([]);

    devices[0]!.send({ type: 'end' });
    const updates = await Promise.all(devices.map((d) => d.update()));
    const { view, ended } = updates[0]!;
    expect(ended).toEqual({ at: expect.any(String), turn: 1, by: 'p1' });
    expect(updates.every((u) => u.joinCode === null && u.ended?.at === ended!.at)).toBe(true);
    expect(view!.turn).toEqual({ number: 1, activePlayerId: 'p2', step: 'draw' });
    expect(view!.players.p2!.life).toBe(42);
    expect(view).toMatchObject({ reminders: [], stepsAhead: [], combatPreview: null, awaitingResponseFrom: [] });
    expect((await join(joinCode)).status).toBe(404);

    await runInDurableObject(env.GAME.getByName(code), async (_game, state) => {
      expect(await state.storage.get('turn')).toBeNull();
      expect(await state.storage.get('sealed:1')).toMatchObject({ turn: 1, warnings: [], finalBoard: { turn: { step: 'draw' } } });
    });
  });

  it('records the shared screen as nobody, and refuses ending a game still in the lobby', async () => {
    const { devices } = await lobby('Theo');
    devices[0]!.send({ type: 'end' });
    expect(await devices[0]!.next()).toEqual({ type: 'error', message: "The game hasn't started yet" });

    const game = await started();
    const screen = await connect(game.code);
    await screen.update();
    screen.send({ type: 'end' });
    expect((await screen.update()).ended?.by).toBeNull();
  });

  it('refuses anything that would change the game, but still lets a device take a seat or watch', async () => {
    const { code, devices } = await started();
    devices[0]!.send({ type: 'end' });
    await everyone(devices);

    const refused: DeviceMessage[] = [
      { type: 'statement', text: 'I play a Forest' },
      { type: 'adjustLife', delta: -1 },
      { type: 'nextStep', from: 'upkeep' },
      { type: 'jumpToStep', from: 'upkeep', to: 'endTurn' },
    ];
    for (const message of refused) {
      devices[1]!.send(message);
      expect(await devices[1]!.next()).toEqual({ type: 'error', message: 'This game has ended.' });
    }
    devices[2]!.send({ type: 'end' });
    expect(await devices[2]!.next()).toEqual({ type: 'error', message: 'The game has already ended' });

    const reloaded = await connect(code);
    expect((await reloaded.update()).ended).not.toBeNull();
    reloaded.send({ type: 'claim', seatId: 'p3', takeOver: true });
    expect((await reloaded.update()).you).toBe('p3');
    reloaded.send({ type: 'watch' });
    expect((await reloaded.update()).you).toBeNull();
  });

  it('keeps the statements of every sealed turn, and the frozen board after the Game object wakes up', async () => {
    const { code, devices } = await started();
    devices[0]!.send({ type: 'statement', text: 'Elena loses 3 life' });
    await everyone(devices);
    devices[1]!.send({ type: 'adjustLife', delta: -4 });
    await everyone(devices);
    devices[1]!.send({ type: 'end' });
    const frozen = await everyone(devices);

    await runInDurableObject(env.GAME.getByName(code), async (_game, state) => {
      expect(await state.storage.get('sealed:1')).toMatchObject({ statements: [{ id: 's1', playerId: 'p1', text: 'Elena loses 3 life' }] });
      const woken = new Game(state, env);
      await state.blockConcurrencyWhile(async () => {});
      expect((woken as unknown as { view(): unknown }).view()).toEqual(frozen);
    });
  });

  it('drops a reading that comes back after the game ended', async () => {
    const { code, devices, call, say } = await interpreting();
    await say(0, 'Elena loses 3 life');
    const first = await call(0);
    devices[1]!.send({ type: 'end' });
    const frozen = await everyone(devices);

    first.answer(reading('s1'));
    const screen = await connect(code);
    expect((await screen.update()).view).toEqual(frozen);
    await runInDurableObject(env.GAME.getByName(code), async (_game, state) => {
      expect(await state.storage.get('turn')).toBeNull();
    });
  });
});

describe('The reading becomes the board', () => {
  const lifeIn = (step: string, player: string, delta: number, ...from: string[]) => ({ step, player: 'p1', action: { type: 'life', player, delta }, from });

  it('changes every screen when a reading comes back', async () => {
    const { devices, call, say } = await interpreting();
    await say(0, 'Elena loses 3 life');
    (await call(0)).answer(reading('s1'));
    expect((await everyone(devices)).players.p2!.life).toBe(37);
  });

  it('keeps a tap through every re-read, tells the interpreter about it, and never counts it twice (ADR 0065)', async () => {
    const { devices, call, say } = await interpreting();
    devices[1]!.send({ type: 'adjustLife', delta: -2 });
    expect((await everyone(devices)).players.p2!.life).toBe(38);

    await say(0, 'Elena loses 3 life');
    const first = await call(0);
    expect(first.user).toContain('Already recorded by a tap on the board (never add these):\n- p2 lost 2 life (tapped by Elena, before anything was said, in upkeep)');
    first.answer(reading('s1'));
    expect((await everyone(devices)).players.p2!.life).toBe(35);

    await say(0, 'Wait, no, take that back');
    (await call(1)).answer({ entries: [], questions: [] });
    expect((await everyone(devices)).players.p2!.life).toBe(38);
  });

  it('moves the table forward to a later Step a statement describes, never back (ADR 0066)', async () => {
    const { devices, call, say, stored } = await interpreting();
    await say(1, 'Moving on, Theo takes 1 in combat');
    (await call(0)).answer({ entries: [lifeIn('declareAttackers', 'p1', -1, 's1')], questions: [] });
    const view = await everyone(devices);
    expect(view.turn.step).toBe('declareAttackers');
    expect(view.players.p1!.life).toBe(39);
    expect(((await stored()) as unknown as { currentStep: string }).currentStep).toBe('declareAttackers');

    await say(1, 'Back in my upkeep I lost 1');
    (await call(1)).answer({ entries: [lifeIn('upkeep', 'p2', -1, 's2'), lifeIn('declareAttackers', 'p1', -1, 's1')], questions: [] });
    const later = await everyone(devices);
    expect(later.turn.step).toBe('declareAttackers');
    expect(later.players.p2!.life).toBe(39);
  });

  it('seals what was read and said, with the taps (ADR 0019)', async () => {
    const { code, devices, call, say } = await interpreting();
    devices[1]!.send({ type: 'adjustLife', delta: -2 });
    await everyone(devices);
    await say(0, 'Elena loses 3 life');
    (await call(0)).answer(reading('s1'));
    await everyone(devices);
    devices[1]!.send({ type: 'jumpToStep', from: 'upkeep', to: 'endTurn' });
    expect((await everyone(devices)).players.p2!.life).toBe(35);

    await runInDurableObject(env.GAME.getByName(code), async (_instance, state) => {
      const sealed = (await state.storage.get('sealed:1')) as { timeline: { from: string[] }[]; statements: { text: string }[] };
      expect(sealed.timeline.map((e) => e.from)).toEqual([[], ['s1']]);
      expect(sealed.statements.map((s) => s.text)).toEqual(['Elena loses 3 life']);
    });
  });
});

describe("The turn's log (ADR 0106)", () => {
  const logOf = async (devices: Awaited<ReturnType<typeof connect>>[]) => {
    const updates = [];
    for (const d of devices) updates.push(await d.update());
    for (const u of updates) expect(u.log).toEqual(updates[0]!.log);
    return updates[0]!.log!;
  };

  it('shows each statement as being read, then read, with the entries it became', async () => {
    const game = await interpreting();
    game.devices[0]!.send({ type: 'statement', text: 'Elena loses 3 life' });
    expect((await logOf(game.devices)).statements).toEqual([{ id: 's1', playerId: 'p1', text: 'Elena loses 3 life', status: 'interpreting' }]);

    (await game.call(0)).answer(reading('s1'));
    const log = await logOf(game.devices);
    expect(log.statements[0]!.status).toBe('read');
    expect(log.entries).toEqual([{ step: 'upkeep', playerId: 'p1', gameAction: { type: 'life', playerId: 'p2', delta: -3 }, from: ['s1'] }]);
  });

  it("marks statements the last reading couldn't interpret, and reads them again on Try again (ADR 0067)", async () => {
    const game = await interpreting();
    game.devices[0]!.send({ type: 'statement', text: 'Elena loses 3 life' });
    await logOf(game.devices);
    (await game.call(0)).fail();
    expect((await logOf(game.devices)).statements[0]!.status).toBe('failed');

    game.devices[2]!.send({ type: 'retryInterpretation' });
    expect((await logOf(game.devices)).statements[0]!.status).toBe('interpreting');
    (await game.call(1)).answer(reading('s1'));
    expect((await logOf(game.devices)).statements[0]!.status).toBe('read');
  });

  it('lists taps in the log with no statement behind them', async () => {
    const game = await interpreting();
    game.devices[1]!.send({ type: 'adjustLife', delta: -2 });
    expect((await logOf(game.devices)).entries).toEqual([{ step: 'upkeep', playerId: 'p2', gameAction: { type: 'life', playerId: 'p2', delta: -2 }, from: [] }]);
  });

  it('refuses Try again before anything was said', async () => {
    const game = await interpreting();
    game.devices[0]!.send({ type: 'retryInterpretation' });
    expect(await game.devices[0]!.next()).toEqual({ type: 'error', message: 'Nothing has been said yet' });
  });
});

describe("The reading's questions (ADR 0068)", () => {
  it('shows a question on every screen and tells the interpreter about it next time, until an answer settles it', async () => {
    const game = await interpreting();
    const question = { kind: 'yesNo', askPlayer: 'p2', text: 'Elena, did you lose 3 life?', about: ['s1'] };
    await game.say(0, 'Elena loses 3 life, I think');
    (await game.call(0)).answer({ entries: [], questions: [question] });
    const updates = [];
    for (const d of game.devices) updates.push(await d.update());
    for (const u of updates) expect(u.log!.questions).toEqual([question]);

    await game.say(1, 'Yes');
    const next = await game.call(1);
    expect(next.user).toContain('Questions you asked last time, still open (a later statement may answer one):\n- To Elena (p2), about [s1], yesNo: "Elena, did you lose 3 life?"');
    next.answer(reading('s1', 's2'));
    const after = [];
    for (const d of game.devices) after.push(await d.update());
    expect(after[0]!.log!.questions).toEqual([]);
    expect(after[0]!.view!.players.p2!.life).toBe(37);
  });
});

describe('The Shared screen speaks for a seat (ADR 0107)', () => {
  it("takes a watching device's statement as the seat it names, and a seated phone's only as its own", async () => {
    const game = await interpreting();
    const screen = await connect(game.code);
    await screen.update();
    screen.send({ type: 'watch' });
    await screen.update();
    for (const d of game.devices) await d.update();

    screen.send({ type: 'statement', text: 'I lose 2 life', seatId: 'p3' });
    const updates = [await screen.update()];
    for (const d of game.devices) updates.push(await d.update());
    expect(updates[0]!.log!.statements).toMatchObject([{ id: 's1', playerId: 'p3', text: 'I lose 2 life' }]);
    expect((await game.call(0)).user).toContain('[s1] Michael (p3): "I lose 2 life"');

    game.devices[0]!.send({ type: 'statement', text: 'Elena loses 1', seatId: 'p2' });
    expect(await game.devices[0]!.next()).toEqual({ type: 'error', message: 'A phone speaks only for its own seat' });
    screen.send({ type: 'statement', text: 'I lose 1', seatId: 'p9' });
    expect(await screen.next()).toEqual({ type: 'error', message: 'No such seat' });
  });
});

describe("A game knows its Decks' cards (ADR 0119, 0120)", () => {
  const castSolRing = { entries: [{ step: 'upkeep', player: 'p2', action: { type: 'cast', card: 'Sol Ring' }, from: ['s1'] }], questions: [] };

  it("fills the engine's card list at Start, so a cast card reaches the battlefield with its types", async () => {
    const { devices, call, say } = await interpreting();
    await say(1, 'I cast Sol Ring');
    (await call(0)).answer(castSolRing);
    const view = await everyone(devices);
    expect(view.permanents.map((p) => [p.card, p.types])).toEqual([['Sol Ring', ['Artifact']]]);
    expect(view.warnings.map((w) => w.code)).not.toContain('unknownCard');
  });

  it("keeps the Decks' cards out of saved and sealed turns, and loads them again when the game wakes", async () => {
    const { code, devices, call, say } = await interpreting();
    await say(1, 'I cast Sol Ring');
    (await call(0)).answer(castSolRing);
    const view = await everyone(devices);

    await runInDurableObject(env.GAME.getByName(code), async (_game, state) => {
      const turn = (await state.storage.get('turn')) as { turnStart: { cards: Record<string, unknown> } };
      expect(Object.keys(turn.turnStart.cards)).toEqual([]);
      const woken = new Game(state, env);
      await state.blockConcurrencyWhile(async () => {});
      expect((woken as unknown as { view(): { permanents: unknown } }).view().permanents).toEqual(view.permanents);
    });

    devices[1]!.send({ type: 'jumpToStep', from: 'upkeep', to: 'endTurn' });
    await everyone(devices);
    await runInDurableObject(env.GAME.getByName(code), async (_game, state) => {
      const sealed = (await state.storage.get('sealed:1')) as { finalBoard: { cards: Record<string, unknown>; permanents: Record<string, unknown> } };
      expect(Object.keys(sealed.finalBoard.cards)).toEqual([]);
      expect(Object.keys(sealed.finalBoard.permanents)).toHaveLength(1);
    });
  });

  it('refers to the Deck version each seat brought, which later edits leave alone', async () => {
    const id = 'edited-deck';
    await deckStore(id).importList('Edited', '1x Vona, Butcher of Magan (lcc) 293 [Commander]\n1 Sol Ring');
    const code = await createGame();
    const device = await connect(code);
    await device.update();
    device.send({ type: 'join', name: 'Theo', deckId: id });
    await device.update();
    device.send({ type: 'start', firstSeatId: 'p1' });
    await device.update();

    await deckStore(id).markCommanders(id, ['6ad8011d-3471-4369-9d68-b264cc027487']);
    await runInDurableObject(env.GAME.getByName(code), async (_game, state) => {
      const setup = (await state.storage.get('setup')) as { decks: Record<string, { versionId: string }> };
      expect(setup.decks.p1!.versionId).toBe(`${id}.1`);
    });
  });

  it("gives each player their Deck's colour identity, for ADR 0110's warning", async () => {
    const { view } = await started();
    expect(Object.values(view.players).map((p) => p.colorIdentity)).toEqual([['W', 'B'], ['W', 'B'], ['W', 'B']]);
  });
});
