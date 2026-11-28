import { GAME_CODE } from './codes.js';

export const SEED_PATH = '/api/dev/seed';

/** The D1 tables a seed carries, parents first so loading never breaks a reference. */
const TABLES = ['cards', 'printings', 'decks', 'deck_versions', 'deck_version_cards'] as const;

export interface Seed {
  format: 1;
  /** Every Deck with its versions, and only the cards and printings they use. */
  tables: Record<(typeof TABLES)[number], Record<string, unknown>[]>;
  /** Each seeded game's Durable Object storage, by game code. */
  games: Record<string, Record<string, unknown>>;
}

type SeedEnv = Pick<Env, 'DB' | 'GAME' | 'LOCAL_DEV'>;

/**
 * The local seed (ADR 0143): `GET` reads every Deck and the named games (`?games=A,B`) as a Seed, and `POST` loads one,
 * replacing rows with the same keys and each named game's storage. Only local development serves it.
 */
export async function handleSeed(request: Request, env: SeedEnv): Promise<Response> {
  if (env.LOCAL_DEV !== 'true') return new Response('Not found', { status: 404 });
  if (request.method === 'GET') {
    const codes = (new URL(request.url).searchParams.get('games') ?? '').split(',').filter(Boolean).map((c) => c.toUpperCase());
    const seed = await readSeed(env, codes);
    return typeof seed === 'string' ? Response.json({ error: seed }, { status: 404 }) : Response.json(seed);
  }
  if (request.method === 'POST') {
    const seed = (await request.json()) as Seed;
    if (seed.format !== 1) return Response.json({ error: 'Unknown seed format' }, { status: 400 });
    await loadSeed(env, seed);
    return Response.json({ decks: seed.tables.decks.length, games: Object.keys(seed.games) });
  }
  return new Response('Not found', { status: 404 });
}

async function readSeed(env: SeedEnv, codes: string[]): Promise<Seed | string> {
  const rows = async (sql: string) => (await env.DB.prepare(sql).all<Record<string, unknown>>()).results;
  const used = 'SELECT oracle_id FROM deck_version_cards';
  const tables: Seed['tables'] = {
    cards: await rows(`SELECT * FROM cards WHERE oracle_id IN (${used}) ORDER BY oracle_id`),
    printings: await rows('SELECT * FROM printings WHERE scryfall_id IN (SELECT scryfall_id FROM deck_version_cards) ORDER BY scryfall_id'),
    decks: await rows('SELECT * FROM decks ORDER BY id'),
    deck_versions: await rows('SELECT * FROM deck_versions ORDER BY id'),
    deck_version_cards: await rows('SELECT * FROM deck_version_cards ORDER BY version_id, position'),
  };
  const games: Seed['games'] = {};
  for (const code of codes) {
    const entries = GAME_CODE.test(code) ? await env.GAME.getByName(code).storageEntries() : null;
    if (!entries) return `No game ${code}`;
    games[code] = entries;
  }
  return { format: 1, tables, games };
}

async function loadSeed(env: SeedEnv, seed: Seed): Promise<void> {
  const statements = TABLES.flatMap((table) =>
    (seed.tables[table] ?? []).map((row) => {
      const columns = Object.keys(row);
      return env.DB.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `?${i + 1}`).join(', ')})`).bind(...columns.map((c) => row[c] ?? null));
    }),
  );
  if (statements.length) await env.DB.batch(statements);
  for (const [code, entries] of Object.entries(seed.games)) await env.GAME.getByName(code).restoreStorage(entries);
}
