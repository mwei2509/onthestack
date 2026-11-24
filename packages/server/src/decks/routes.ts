import { z } from 'zod';
import { ScryfallUnavailable } from '../cards/scryfall.js';
import type { DeckStore } from './store.js';

export const DECKS_PATH = /^\/api\/decks(?:\/([A-Za-z0-9-]{1,64}))?$/;

const ImportList = z.object({
  name: z.string().trim().min(1, 'A Deck needs a name').max(60, 'Deck names are at most 60 characters'),
  list: z.string().min(1, 'Paste a Deck list').max(30_000, 'That list is too long for one Deck'),
});

const badRequest = (error: z.ZodError) => Response.json({ error: error.issues[0]?.message }, { status: 400 });

/** `/api/decks` (list, import a pasted list) and `/api/decks/:id` (one Deck). */
export async function handleDecks(request: Request, id: string | undefined, store: DeckStore): Promise<Response> {
  try {
    if (id === undefined && request.method === 'GET') return Response.json(await store.list());

    if (id === undefined && request.method === 'POST') {
      const body = ImportList.safeParse(await request.json().catch(() => null));
      if (!body.success) return badRequest(body.error);
      return Response.json(await store.importList(body.data.name, body.data.list), { status: 201 });
    }

    if (id !== undefined && request.method === 'GET') {
      const deck = await store.get(id);
      return deck ? Response.json(deck) : Response.json({ error: 'No Deck with that id' }, { status: 404 });
    }
  } catch (e) {
    if (e instanceof ScryfallUnavailable) {
      return Response.json({ error: "Scryfall isn't answering. Try again in a minute." }, { status: 503 });
    }
    throw e;
  }
  return new Response('Not found', { status: 404 });
}
