import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '../src/game.js';

async function connect(gameId: string) {
  const res = await exports.default.fetch(`http://test/api/games/${gameId}/ws`, {
    headers: { Upgrade: 'websocket' },
  });
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
  return { ws, next };
}

describe('Worker', () => {
  it('answers health checks', async () => {
    const res = await exports.default.fetch('http://test/api/health');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects non-WebSocket requests to a game', async () => {
    const res = await exports.default.fetch('http://test/api/games/abc/ws');
    expect(res.status).toBe(426);
  });
});

describe('Game durable object', () => {
  it('sends empty state on connect, then broadcasts a created game to every socket', async () => {
    const theo = await connect('table-1');
    const elena = await connect('table-1');
    expect(await theo.next()).toEqual({ type: 'state', state: null });
    expect(await elena.next()).toEqual({ type: 'state', state: null });

    theo.ws.send(JSON.stringify({ type: 'createGame', seating: [{ id: 'theo', name: 'Theo' }, { id: 'elena', name: 'Elena' }] }));

    for (const player of [theo, elena]) {
      const msg = await player.next();
      expect(msg.type).toBe('state');
      expect(msg.type === 'state' && msg.state?.players.map((p) => p.life)).toEqual([40, 40]);
    }
  });

  it('reports engine errors to the sender only', async () => {
    const theo = await connect('table-2');
    await theo.next();
    theo.ws.send(JSON.stringify({ type: 'createGame', seating: [] }));
    expect(await theo.next()).toEqual({ type: 'error', message: 'A game needs at least one player' });
  });
});
