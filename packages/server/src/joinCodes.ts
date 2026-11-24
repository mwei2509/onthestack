export const JOIN_CODE = /^\d{6}$/;

/** A game idle this long gives up its join code (ADR 0095). */
export const IDLE_MS = 24 * 60 * 60 * 1000;

const cutoff = (now: Date) => new Date(now.getTime() - IDLE_MS).toISOString();

const CLAIM = `
  INSERT INTO join_codes (code, game_code, active_at) VALUES (?1, ?2, ?3)
  ON CONFLICT (code) DO UPDATE SET game_code = excluded.game_code, active_at = excluded.active_at
  WHERE join_codes.active_at < ?4`;

/**
 * Gives a game a free six-digit code: one never used, or one whose game has gone idle. Checking and taking happen in
 * one statement, so two games can't get the same code. Null if every try hit a code in use.
 */
export async function claimJoinCode(db: D1Database, gameCode: string, now: Date, random: (n: number) => number = randomInt): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(random(1_000_000)).padStart(6, '0');
    const result = await db.prepare(CLAIM).bind(code, gameCode, now.toISOString(), cutoff(now)).run();
    if (result.meta.changes === 1) return code;
  }
  return null;
}

/** The game a join code belongs to, unless the code has been retired. */
export async function findGameByJoinCode(db: D1Database, code: string, now: Date): Promise<string | null> {
  const row = await db
    .prepare('SELECT game_code FROM join_codes WHERE code = ? AND active_at >= ?')
    .bind(code, cutoff(now))
    .first<{ game_code: string }>();
  return row?.game_code ?? null;
}

/** Marks a game as still active. False if its code has been retired in the meantime. */
export async function touchJoinCode(db: D1Database, code: string, gameCode: string, now: Date): Promise<boolean> {
  const result = await db
    .prepare('UPDATE join_codes SET active_at = ?3 WHERE code = ?1 AND game_code = ?2 AND active_at >= ?4')
    .bind(code, gameCode, now.toISOString(), cutoff(now))
    .run();
  return result.meta.changes === 1;
}

/** Frees a game's code at once, as when the game ends, so a new game can have it. */
export async function retireJoinCode(db: D1Database, code: string, gameCode: string): Promise<void> {
  await db.prepare('DELETE FROM join_codes WHERE code = ? AND game_code = ?').bind(code, gameCode).run();
}

function randomInt(n: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % n;
}
