import { GAME_CODE, newGameCode } from './codes.js';

export { Game } from './game.js';

const GAME = /^\/api\/games\/([A-Za-z0-9-]{1,32})(\/ws)?$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true });
    }

    if (url.pathname === '/api/games' && request.method === 'POST') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newGameCode();
        if (await env.GAME.getByName(code).create(code, new Date().toISOString())) {
          return Response.json({ code }, { status: 201 });
        }
      }
      return Response.json({ error: 'Could not find a free game code' }, { status: 503 });
    }

    const match = GAME.exec(url.pathname);
    if (match?.[1]) {
      const code = match[1].toUpperCase();
      if (!GAME_CODE.test(code)) return new Response('No game with that code', { status: 404 });
      const game = env.GAME.getByName(code);
      if (match[2]) return game.fetch(request);
      if (request.method === 'GET') {
        return (await game.exists()) ? Response.json({ code }) : Response.json({ error: 'No game with that code' }, { status: 404 });
      }
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
