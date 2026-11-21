import { DurableObject } from 'cloudflare:workers';
import { createGame, type GameState, type NewPlayer } from '@onthestack/engine';

type ClientMessage = { type: 'createGame'; seating: NewPlayer[] };
export type ServerMessage = { type: 'state'; state: GameState | null } | { type: 'error'; message: string };

export class Game extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    send(server, { type: 'state', state: await this.load() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return send(ws, { type: 'error', message: 'Messages must be JSON' });
    }

    if (message.type === 'createGame') {
      let state: GameState;
      try {
        state = createGame(message.seating);
      } catch (e) {
        return send(ws, { type: 'error', message: (e as Error).message });
      }
      await this.ctx.storage.put('state', state);
      this.broadcast({ type: 'state', state });
    }
  }

  private async load(): Promise<GameState | null> {
    return (await this.ctx.storage.get<GameState>('state')) ?? null;
  }

  private broadcast(message: ServerMessage): void {
    for (const ws of this.ctx.getWebSockets()) send(ws, message);
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}
