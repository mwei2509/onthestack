import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { worktreeRoot } from '../utils/git.js';
import { summarize } from './game.js';

/** Runs SQL on the D1 database through wrangler, so no endpoint exposes reports (ADR 0118). */
function query<T>(sql: string, remote: boolean): T[] {
  const result = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'DB', remote ? '--remote' : '--local', '--json', '--command', sql],
    { cwd: join(worktreeRoot(), 'packages/server'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  const parsed = JSON.parse(result.stdout) as { results: T[] }[];
  return parsed[0]?.results ?? [];
}

interface ReportRow {
  id: string;
  game_code: string;
  turn: number | null;
  step: string | null;
  reporter_name: string | null;
  text: string;
  created_at: string;
  dump_trimmed: number;
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

const showCommand = new Command('show')
  .description("One report: what was said, and the game as it was when it was sent")
  .argument('<id>', 'the report id, or its first characters')
  .option('--remote', 'read production')
  .option('--summary', "print a readable digest of the saved game instead of its JSON")
  .action((id: string, opts: { remote?: boolean; summary?: boolean }) => {
    const rows = query<ReportRow & { dump: string }>(`SELECT * FROM reports WHERE id LIKE ${quote(`${id}%`)} LIMIT 2`, !!opts.remote);
    if (rows.length !== 1) {
      console.error(rows.length ? `"${id}" matches more than one report; give more of its id.` : `No report "${id}".`);
      process.exit(1);
    }
    const r = rows[0]!;
    const dump = { code: r.game_code, ...(JSON.parse(r.dump) as Record<string, unknown>) };
    console.log(`Report ${r.id} · ${r.created_at} · ${r.game_code} turn ${r.turn ?? '-'} ${r.step ?? ''} · from ${r.reporter_name ?? 'the Shared screen'}`);
    console.log(`"${r.text}"${r.dump_trimmed ? '  (its dump was trimmed to fit)' : ''}\n`);
    console.log(opts.summary ? summarize(dump) : JSON.stringify(dump, null, 2));
  });

export const reportsCommand = new Command('reports')
  .description("Reports players sent with Something's wrong? (ADR 0118), newest first")
  .option('--remote', 'read production')
  .option('--limit <n>', 'how many', '20')
  .action((opts: { remote?: boolean; limit: string }) => {
    const limit = Math.max(1, Math.min(200, Number(opts.limit) || 20));
    const rows = query<ReportRow>(
      `SELECT id, game_code, turn, step, reporter_name, text, created_at, dump_trimmed FROM reports ORDER BY created_at DESC LIMIT ${limit}`,
      !!opts.remote,
    );
    if (rows.length === 0) return console.log('No reports yet.');
    for (const r of rows) {
      console.log(`${r.id.slice(0, 8)}  ${r.created_at.slice(0, 16).replace('T', ' ')}  ${r.game_code} t${r.turn ?? '-'} ${r.step ?? ''}  ${r.reporter_name ?? 'Shared screen'}: "${r.text}"`);
    }
  })
  .addCommand(showCommand);
