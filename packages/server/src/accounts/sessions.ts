import { readCookie, setCookie } from './cookies.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_MS = 30 * DAY_MS;
export const RENEW_AFTER_MS = DAY_MS;

const COOKIE = 'session';

export interface Session {
  accountId: string;
  /** True when this lookup pushed the expiry out, so the cookie should be sent again. */
  renewed: boolean;
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

async function hash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Starts a session and returns its token, which only the cookie holds. Clears the account's expired sessions. */
export async function startSession(db: D1Database, accountId: string, now: Date): Promise<string> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const expired = new Date(now.getTime() - SESSION_MS).toISOString();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE account_id = ? AND renewed_at <= ?').bind(accountId, expired),
    db
      .prepare('INSERT INTO sessions (token_hash, account_id, renewed_at) VALUES (?, ?, ?)')
      .bind(await hash(token), accountId, now.toISOString()),
  ]);
  return token;
}

/** The session a token belongs to, renewed if it was last renewed over a day ago (ADR 0104); null once expired. */
export async function findSession(db: D1Database, token: string, now: Date): Promise<Session | null> {
  const tokenHash = await hash(token);
  const row = await db
    .prepare('SELECT account_id, renewed_at FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ account_id: string; renewed_at: string }>();
  if (!row) return null;
  const age = now.getTime() - Date.parse(row.renewed_at);
  if (age >= SESSION_MS) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  if (age < RENEW_AFTER_MS) return { accountId: row.account_id, renewed: false };
  await db.prepare('UPDATE sessions SET renewed_at = ? WHERE token_hash = ?').bind(now.toISOString(), tokenHash).run();
  return { accountId: row.account_id, renewed: true };
}

export async function endSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(token)).run();
}

export async function endAllSessions(db: D1Database, accountId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE account_id = ?').bind(accountId).run();
}

export const sessionToken = (request: Request) => readCookie(request, COOKIE);

export const sessionCookie = (request: Request, token: string) =>
  setCookie(request, COOKIE, token, { maxAgeSeconds: SESSION_MS / 1000 });

export const clearedSessionCookie = (request: Request) => setCookie(request, COOKIE, '', { maxAgeSeconds: 0 });
