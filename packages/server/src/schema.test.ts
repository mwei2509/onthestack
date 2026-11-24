import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

const solRing = {
  oracle_id: '6ad8011d-3471-4369-9d68-b264cc027487',
  name: 'Sol Ring',
};

async function insertSolRing() {
  await env.DB.prepare('INSERT INTO cards (oracle_id, name, data, fetched_at) VALUES (?, ?, ?, ?)')
    .bind(solRing.oracle_id, solRing.name, '{}', '2026-11-23T00:00:00Z')
    .run();
  await env.DB.prepare(
    'INSERT INTO printings (scryfall_id, oracle_id, set_code, collector_number) VALUES (?, ?, ?, ?)',
  )
    .bind('4cbc6901-6a4a-4d0a-83ea-7eefa3b35021', solRing.oracle_id, 'C21', '263')
    .run();
}

describe('the card store schema', () => {
  beforeAll(insertSolRing);

  it('finds a card by name in any case', async () => {
    const row = await env.DB.prepare('SELECT oracle_id FROM cards WHERE name = ?').bind('sol ring').first();
    expect(row).toEqual({ oracle_id: solRing.oracle_id });
  });

  it('finds a printing by set code in any case and collector number', async () => {
    const row = await env.DB.prepare('SELECT oracle_id FROM printings WHERE set_code = ? AND collector_number = ?')
      .bind('c21', '263')
      .first();
    expect(row).toEqual({ oracle_id: solRing.oracle_id });
  });
});
