export { Game } from './game.js';

const GAME_SOCKET = /^\/api\/games\/([A-Za-z0-9_-]{1,64})\/ws$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true });
    }

    const match = GAME_SOCKET.exec(url.pathname);
    if (match?.[1]) {
      return env.GAME.get(env.GAME.idFromName(match[1])).fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
