import { z } from 'zod';
import { ScryfallUnavailable } from '../cards/scryfall.js';
import { archidektIdOf, ArchidektUnavailable, fetchArchidektDeck } from './archidekt.js';
import { DeckChanged, NotOnDeck, type DeckStore } from './store.js';

export const DECKS_PATH = /^\/api\/decks(?:\/([A-Za-z0-9-]{1,64})(?:\/unmatched\/(\d{1,4}))?)?$/;

const deckName = z.string().trim().min(1, 'A Deck needs a name').max(60, 'Deck names are at most 60 characters');

const ImportList = z.object({
  name: deckName,
  list: z.string().min(1, 'Paste a Deck list').max(30_000, 'That list is too long for one Deck'),
});

const ImportArchidekt = z.object({
  archidekt: z.string().refine((link) => archidektIdOf(link) !== null, "That isn't an Archidekt Deck link"),
});

const EditDeck = z.union([
  z.object({ name: deckName }),
  z.object({ commanders: z.array(z.string()).min(1, 'Mark a commander').max(2, 'A Deck has at most two commanders') }),
]);

const EditLine = z.discriminatedUnion('action', [
  z.object({ action: z.literal('fix'), was: z.string(), text: z.string().trim().min(1, 'Type the line').max(200) }),
  z.object({ action: z.literal('skip'), was: z.string() }),
]);

const json = (request: Request) => request.json().catch(() => null);
const noDeck = () => Response.json({ error: 'No Deck with that id' }, { status: 404 });
const deckOr404 = (deck: unknown) => (deck ? Response.json(deck) : noDeck());

const badRequest = (error: z.ZodError) => Response.json({ error: error.issues[0]?.message }, { status: 400 });

/**
 * `/api/decks` (list, import a pasted list), `/api/decks/:id` (read, rename or mark the commander, delete)
 * and `/api/decks/:id/unmatched/:index` (fix or skip an unmatched line).
 */
export async function handleDecks(
  request: Request,
  id: string | undefined,
  lineIndex: number | undefined,
  { store, fetch }: { store: DeckStore; fetch: typeof globalThis.fetch },
): Promise<Response> {
  try {
    if (id === undefined && request.method === 'GET') return Response.json(await store.list());

    if (id === undefined && request.method === 'POST') {
      const raw: unknown = await json(request);
      if (raw !== null && typeof raw === 'object' && 'archidekt' in raw) {
        const body = ImportArchidekt.safeParse(raw);
        if (!body.success) return badRequest(body.error);
        const archidekt = await fetchArchidektDeck(archidektIdOf(body.data.archidekt)!, fetch);
        const { deck, updated } = await store.importArchidekt(archidekt);
        return Response.json(deck, { status: updated ? 200 : 201 });
      }
      const body = ImportList.safeParse(raw);
      if (!body.success) return badRequest(body.error);
      return Response.json(await store.importList(body.data.name, body.data.list), { status: 201 });
    }

    if (id !== undefined && lineIndex === undefined) {
      if (request.method === 'GET') return deckOr404(await store.get(id));
      if (request.method === 'DELETE') return (await store.remove(id)) ? new Response(null, { status: 204 }) : noDeck();
      if (request.method === 'PATCH') {
        const body = EditDeck.safeParse(await json(request));
        if (!body.success) return badRequest(body.error);
        return deckOr404(
          'name' in body.data ? await store.rename(id, body.data.name) : await store.markCommanders(id, body.data.commanders),
        );
      }
    }

    if (id !== undefined && lineIndex !== undefined && request.method === 'POST') {
      const body = EditLine.safeParse(await json(request));
      if (!body.success) return badRequest(body.error);
      const line = { index: lineIndex, was: body.data.was };
      return deckOr404(
        body.data.action === 'fix' ? await store.fixLine(id, line, body.data.text) : await store.skipLine(id, line),
      );
    }
  } catch (e) {
    if (e instanceof DeckChanged) {
      return Response.json({ error: 'Someone else changed this Deck. Reload it and try again.' }, { status: 409 });
    }
    if (e instanceof ArchidektUnavailable) return Response.json({ error: e.message }, { status: 502 });
    if (e instanceof NotOnDeck) return Response.json({ error: "That card isn't on this Deck" }, { status: 400 });
    if (e instanceof ScryfallUnavailable) {
      return Response.json({ error: "Scryfall isn't answering. Try again in a minute." }, { status: 503 });
    }
    throw e;
  }
  return new Response('Not found', { status: 404 });
}
