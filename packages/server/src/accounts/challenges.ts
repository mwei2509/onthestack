import { readCookie, setCookie } from './cookies.js';

export const CHALLENGE_MS = 5 * 60 * 1000;

const COOKIE = 'auth_challenge';

/** Remembers a passkey prompt's challenge for 5 minutes (ADR 0103). */
export async function saveChallenge(db: D1Database, id: string, challenge: string, now: Date): Promise<void> {
  await db
    .prepare('INSERT INTO auth_challenges (id, challenge, created_at) VALUES (?, ?, ?)')
    .bind(id, challenge, now.toISOString())
    .run();
}

/** The challenge saved under this id, usable once; null if it's gone or more than 5 minutes old. */
export async function takeChallenge(db: D1Database, id: string, now: Date): Promise<string | null> {
  const row = await db
    .prepare('DELETE FROM auth_challenges WHERE id = ? RETURNING challenge, created_at')
    .bind(id)
    .first<{ challenge: string; created_at: string }>();
  if (!row || now.getTime() - Date.parse(row.created_at) >= CHALLENGE_MS) return null;
  return row.challenge;
}

/** Challenges abandoned at the prompt are deleted when the next one is saved. */
export async function clearOldChallenges(db: D1Database, now: Date): Promise<void> {
  await db
    .prepare('DELETE FROM auth_challenges WHERE created_at <= ?')
    .bind(new Date(now.getTime() - CHALLENGE_MS).toISOString())
    .run();
}

export const challengeId = (request: Request) => readCookie(request, COOKIE);

const options = { path: '/api/account', sameSite: 'Strict' } as const;

export const challengeCookie = (request: Request, id: string) =>
  setCookie(request, COOKIE, id, { ...options, maxAgeSeconds: CHALLENGE_MS / 1000 });

export const clearedChallengeCookie = (request: Request) => setCookie(request, COOKIE, '', { ...options, maxAgeSeconds: 0 });
