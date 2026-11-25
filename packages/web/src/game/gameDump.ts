export type DumpResult = { json: string } | { error: string };

/** The game's dump (ADR 0117) as indented JSON, or what the server said when it refused (ADR 0130). */
export async function readGameDump(code: string, fetchImpl: typeof fetch = fetch): Promise<DumpResult> {
  try {
    const res = await fetchImpl(`/api/games/${encodeURIComponent(code)}/debug`);
    const text = await res.text();
    if (!res.ok) return { error: `${res.status}: ${text.trim() || res.statusText}` };
    return { json: JSON.stringify(JSON.parse(text), null, 2) };
  } catch (e) {
    return { error: String(e) };
  }
}
