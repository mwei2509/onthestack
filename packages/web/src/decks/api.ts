import type { DeckDetail, DeckSummary } from '@onthestack/server/decks';

export type { DeckCard, DeckDetail, DeckSummary, UnmatchedLine } from '@onthestack/server/decks';

/** A failed request, carrying the server's message when it sent one. */
export class DeckApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch {
    throw new DeckApiError("Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new DeckApiError(body?.error ?? 'Something went wrong. Try again.');
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export const listDecks = () => call<DeckSummary[]>('/api/decks');
export const getDeck = (id: string) => call<DeckDetail>(`/api/decks/${encodeURIComponent(id)}`);
export const importList = (name: string, list: string) =>
  call<DeckDetail>('/api/decks', { method: 'POST', body: JSON.stringify({ name, list }) });
export const importArchidekt = (link: string) =>
  call<DeckDetail>('/api/decks', { method: 'POST', body: JSON.stringify({ archidekt: link }) });

const send = <T>(path: string, method: string, body?: unknown) =>
  call<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const renameDeck = (id: string, name: string) => send<DeckDetail>(`/api/decks/${encodeURIComponent(id)}`, 'PATCH', { name });
export const markCommanders = (id: string, commanders: string[]) =>
  send<DeckDetail>(`/api/decks/${encodeURIComponent(id)}`, 'PATCH', { commanders });
export const deleteDeck = (id: string) => send<null>(`/api/decks/${encodeURIComponent(id)}`, 'DELETE');
export const fixLine = (id: string, index: number, was: string, text: string) =>
  send<DeckDetail>(`/api/decks/${encodeURIComponent(id)}/unmatched/${index}`, 'POST', { action: 'fix', was, text });
export const skipLine = (id: string, index: number, was: string) =>
  send<DeckDetail>(`/api/decks/${encodeURIComponent(id)}/unmatched/${index}`, 'POST', { action: 'skip', was });
export const suggestNames = async (q: string, signal: AbortSignal) =>
  (await call<{ names: string[] }>(`/api/cards/autocomplete?q=${encodeURIComponent(q)}`, { signal })).names;
