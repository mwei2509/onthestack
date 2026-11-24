import { AUTOCOMPLETE_PATH, handleAutocomplete } from './cards/autocomplete.js';
import { IMAGE_PATH, serveImage } from './cards/images.js';
import { createCardStore } from './cards/store.js';
import { GAME_CODE, newGameCode } from './codes.js';
import { DECKS_PATH, handleDecks } from './decks/routes.js';
import { createDeckStore } from './decks/store.js';

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

    const image = IMAGE_PATH.exec(url.pathname);
    if (image?.[1] && request.method === 'GET') {
      return serveImage(image[1], image[2] !== undefined, { db: env.DB, bucket: env.IMAGES, fetch });
    }

    if (url.pathname === AUTOCOMPLETE_PATH && request.method === 'GET') return handleAutocomplete(request, fetch);

    const decks = DECKS_PATH.exec(url.pathname);
    if (decks) {
      const now = () => new Date();
      const cards = createCardStore({ db: env.DB, fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now });
      const store = createDeckStore({ db: env.DB, cards, now, newId: () => crypto.randomUUID() });
      const lineIndex = decks[2] === undefined ? undefined : Number(decks[2]);
      return handleDecks(request, decks[1], lineIndex, { store, fetch });
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
