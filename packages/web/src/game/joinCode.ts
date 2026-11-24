/** A join code as it's read aloud: two halves, `482 913` (ADR 0095). */
export const formatJoinCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`.trim();

/** What a player has typed so far, kept to six digits whatever else they type or paste. */
export const joinCodeDigits = (typed: string) => typed.replace(/\D/g, '').slice(0, 6);

export type JoinLookup = { code: string } | { error: string };

/** Finds the game for a six-digit code. */
export async function findGame(digits: string): Promise<JoinLookup> {
  try {
    const res = await fetch(`/api/join/${digits}`);
    const body = (await res.json()) as { code?: string; error?: string };
    if (res.ok && body.code) return { code: body.code };
    return { error: body.error ?? 'No game with that code' };
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again." };
  }
}
