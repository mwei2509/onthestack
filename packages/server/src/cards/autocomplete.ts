import { SCRYFALL_HEADERS, ScryfallUnavailable } from './scryfall.js';

export const AUTOCOMPLETE_PATH = '/api/cards/autocomplete';

/** Scryfall's card-name suggestions, for fixing an unmatched line (ADR 0082). Short queries get none. */
export async function suggestNames(query: string, fetchImpl: typeof fetch): Promise<string[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const res = await fetchImpl(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`, {
    headers: SCRYFALL_HEADERS,
  });
  if (!res.ok) throw new ScryfallUnavailable(`Scryfall answered ${res.status}`);
  return ((await res.json()) as { data: string[] }).data;
}

export async function handleAutocomplete(request: Request, fetchImpl: typeof fetch): Promise<Response> {
  try {
    const names = await suggestNames(new URL(request.url).searchParams.get('q') ?? '', fetchImpl);
    return Response.json({ names }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
  } catch (e) {
    if (e instanceof ScryfallUnavailable) return Response.json({ error: "Scryfall isn't answering" }, { status: 503 });
    throw e;
  }
}
