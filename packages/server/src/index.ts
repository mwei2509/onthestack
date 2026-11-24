import { ACCOUNT_PATH, handleAccount } from './accounts/routes.js';
import { AUTOCOMPLETE_PATH, handleAutocomplete } from './cards/autocomplete.js';
import { IMAGE_PATH, serveImage } from './cards/images.js';
import { createCardStore } from './cards/store.js';
import { GAME_CODE, newGameCode } from './codes.js';
import { findGameByJoinCode, JOIN_CODE } from './joinCodes.js';
import { DECKS_PATH, handleDecks } from './decks/routes.js';
import { createDeckStore } from './decks/store.js';

export { Game } from './game.js';

const GAME = /^\/api\/games\/([A-Za-z0-9-]{1,32})(\/ws)?$/;
const JOIN_PATH = /^\/api\/join\/(\d{1,12})$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true });
    }

    if (url.pathname === '/api/games' && request.method === 'POST') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newGameCode();
        const created = await env.GAME.getByName(code).create(code, new Date().toISOString());
        if (created) return Response.json({ code, joinCode: created.joinCode }, { status: 201 });
      }
      return Response.json({ error: 'Could not find a free game code' }, { status: 503 });
    }

    const join = JOIN_PATH.exec(url.pathname);
    if (join?.[1] !== undefined && request.method === 'GET') {
      const { success } = await env.JOIN_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' });
      if (!success) return Response.json({ error: 'Too many tries. Wait a minute and try again.' }, { status: 429 });
      const game = JOIN_CODE.test(join[1]) ? await findGameByJoinCode(env.DB, join[1], new Date()) : null;
      return game ? Response.json({ code: game }) : Response.json({ error: 'No game with that code' }, { status: 404 });
    }

    const image = IMAGE_PATH.exec(url.pathname);
    if (image?.[1] && request.method === 'GET') {
      return serveImage(image[1], image[2] !== undefined, { db: env.DB, bucket: env.IMAGES, fetch });
    }

    if (url.pathname === AUTOCOMPLETE_PATH && request.method === 'GET') return handleAutocomplete(request, fetch);

    const account = ACCOUNT_PATH.exec(url.pathname);
    if (account) return handleAccount(request, account[1], { db: env.DB, now: () => new Date() });

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
