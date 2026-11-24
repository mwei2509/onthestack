import { env, runInDurableObject } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { DeviceMessage, ServerMessage } from './protocol.js';

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
    device.send({ type: 'join', name });
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
      { id: 'p1', name: 'Theo', connected: true },
      { id: 'p2', name: 'Elena', connected: false },
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
    late.send({ type: 'join', name: 'Michael' });
    expect(await late.next()).toEqual({ type: 'error', message: "Joining can't change once the game has started" });
    late.send({ type: 'removeSeat', seatId: 'p1' });
    expect(await late.next()).toEqual({ type: 'error', message: "Seats can't change once the game has started" });
    late.send({ type: 'claim', seatId: 'p2', takeOver: true });
    expect((await late.update()).you).toBe('p2');
  });

  it('takes at most six seats', async () => {
    const { code } = await lobby('Ana', 'Theo', 'Jun', 'Priya', 'Sam', 'Rafa');
    const seventh = await connect(code);
    await seventh.update();
    seventh.send({ type: 'join', name: 'Kim' });
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
    theo!.send({ type: 'join', name: 'Theo again' });
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
    expect(view.commandZone).toEqual({ p1: null, p2: null, p3: null });
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
    expect(first.seats[2]).toEqual({ id: 'p3', name: 'Michael', connected: false });
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
