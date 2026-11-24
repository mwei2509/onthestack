import { env } from 'cloudflare:workers';

export async function clearAccounts(): Promise<void> {
  await env.DB.batch(
    ['sessions', 'sign_ins', 'auth_challenges', 'accounts'].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
}

export async function addAccount(id: string, displayName = 'Ana', email = 'ana@example.com'): Promise<void> {
  await env.DB.prepare('INSERT INTO accounts (id, display_name, email, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, displayName, email, '2026-11-24T12:00:00Z')
    .run();
}
