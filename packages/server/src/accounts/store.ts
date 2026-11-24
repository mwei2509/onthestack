import type { Account, Passkey } from './api.js';

export type { Account, Passkey } from './api.js';

export async function getAccount(db: D1Database, id: string): Promise<Account | null> {
  const row = await db
    .prepare('SELECT id, display_name, email FROM accounts WHERE id = ?')
    .bind(id)
    .first<{ id: string; display_name: string; email: string }>();
  return row && { id: row.id, displayName: row.display_name, email: row.email };
}

export async function updateAccount(
  db: D1Database,
  id: string,
  changes: { displayName?: string; email?: string },
): Promise<Account | null> {
  await db
    .prepare('UPDATE accounts SET display_name = COALESCE(?, display_name), email = COALESCE(?, email) WHERE id = ?')
    .bind(changes.displayName ?? null, changes.email ?? null, id)
    .run();
  return getAccount(db, id);
}

export async function listPasskeys(db: D1Database, accountId: string): Promise<Passkey[]> {
  const { results } = await db
    .prepare(
      "SELECT id, label, created_at, used_at FROM sign_ins WHERE account_id = ? AND kind = 'passkey' ORDER BY created_at, id",
    )
    .bind(accountId)
    .all<{ id: string; label: string; created_at: string; used_at: string | null }>();
  return results.map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at, usedAt: r.used_at }));
}

/** Removes a passkey unless it's the account's only way to sign in (ADR 0105). */
export async function removePasskey(
  db: D1Database,
  accountId: string,
  passkeyId: string,
): Promise<'removed' | 'last' | 'missing'> {
  const { meta } = await db
    .prepare(
      `DELETE FROM sign_ins WHERE id = ? AND account_id = ?
       AND (SELECT COUNT(*) FROM sign_ins WHERE account_id = ?) > 1`,
    )
    .bind(passkeyId, accountId, accountId)
    .run();
  if (meta.changes > 0) return 'removed';
  const exists = await db.prepare('SELECT 1 FROM sign_ins WHERE id = ? AND account_id = ?').bind(passkeyId, accountId).first();
  return exists ? 'last' : 'missing';
}

/** Deletes the account; its sign-in methods and sessions go with it (ADR 0094). */
export async function deleteAccount(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
}
