import fixture from './scryfall-fixture.json';
import type { ScryfallCard, ScryfallIdentifier } from './scryfall.js';

const cards = fixture as ScryfallCard[];

function matches(id: ScryfallIdentifier, card: ScryfallCard): boolean {
  if ('id' in id) return card.id === id.id;
  if ('set' in id) return card.set === id.set.toLowerCase() && card.collector_number === id.collector_number;
  if ('oracle_id' in id) return card.oracle_id === id.oracle_id;
  // Like Scryfall, a card's full "Front // Back" name never matches; only its own faces' names do.
  const names = (card.card_faces ?? [card]).map((f) => f.name.toLowerCase());
  return names.includes(id.name.toLowerCase());
}

/** Answers `POST /cards/collection` from the fixture, and records each request's identifiers and headers. */
export function fakeScryfall(status = 200) {
  const requests: { identifiers: ScryfallIdentifier[]; headers: Headers }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const { identifiers } = JSON.parse(init.body as string) as { identifiers: ScryfallIdentifier[] };
    requests.push({ identifiers, headers: new Headers(init.headers) });
    if (status !== 200) return new Response('{}', { status });
    const data: ScryfallCard[] = [];
    const not_found: ScryfallIdentifier[] = [];
    for (const id of identifiers) {
      const card = cards.find((c) => matches(id, c));
      if (card) data.push(card);
      else not_found.push(id);
    }
    return Response.json({ object: 'list', not_found, data });
  }) as typeof fetch;
  return { fetch: fetchImpl, requests };
}
