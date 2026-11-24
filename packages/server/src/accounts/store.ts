export interface Account {
  id: string;
  displayName: string;
  email: string;
}

export async function getAccount(db: D1Database, id: string): Promise<Account | null> {
  const row = await db
    .prepare('SELECT id, display_name, email FROM accounts WHERE id = ?')
    .bind(id)
    .first<{ id: string; display_name: string; email: string }>();
  return row && { id: row.id, displayName: row.display_name, email: row.email };
}
