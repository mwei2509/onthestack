import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { worktreeRoot } from '../utils/git.js';

const LOCAL = 'http://localhost:8790';
const PROD = 'https://onthestack.gg';

/** A code, or a game's address as copied from the browser (`…/g/MOTH-FALCON-26?debug`). */
export function parseTarget(target: string, prod: boolean): { code: string; base: string } {
  const fromUrl = /\/g\/([A-Za-z0-9-]+)/.exec(target);
  const code = (fromUrl?.[1] ?? target).toUpperCase();
  const onProd = prod || /onthestack\.gg/.test(target);
  return { code, base: onProd ? PROD : (process.env.STX_SERVER_URL ?? LOCAL) };
}

/** DEBUG_TOKEN from the environment or the checkout's `packages/server/.env`, where `wrangler dev` reads secrets too. */
function debugToken(): string | undefined {
  if (process.env.DEBUG_TOKEN) return process.env.DEBUG_TOKEN;
  const file = join(worktreeRoot(), 'packages/server/.env');
  if (!existsSync(file)) return undefined;
  return /^DEBUG_TOKEN=(.*)$/m.exec(readFileSync(file, 'utf8'))?.[1]?.trim();
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the dump is the server's JSON, read loosely for a summary */
/** A readable digest of a dump: per turn what was said and what came of it, then the board now (ADR 0117). */
export function summarize(dump: any): string {
  const out: string[] = [];
  const seats = dump.setup.seats.map((s: any) => `${s.id} ${s.name} (${s.deck?.commanders?.join(' & ') || 'no commander'})`);
  out.push(`Game ${dump.code} · ${dump.setup.ended ? `ended in turn ${dump.setup.ended.turn}` : dump.currentTurn ? 'playing' : 'in the lobby'}`);
  out.push(`Seats: ${seats.join(', ')}`);
  for (const t of dump.sealedTurns ?? []) {
    out.push('', `Turn ${t.turn} (sealed)`);
    for (const s of t.statements ?? []) out.push(`  [${s.id}] ${s.playerId}${s.answering ? ` answering "${s.answering}"` : ''}: "${s.text}"`);
    for (const w of t.warnings ?? []) out.push(`  ! ${w.code}: ${w.message}`);
  }
  const c = dump.currentTurn;
  if (c) {
    out.push('', `Turn ${c.number} (now, in ${c.currentStep})`);
    for (const s of c.statements) out.push(`  [${s.id}] ${s.playerId}${s.answering ? ` answering "${s.answering}"` : ''}: "${s.text}"`);
    for (const e of c.resolved?.timeline ?? []) out.push(`  → ${e.step} ${e.playerId}: ${JSON.stringify(e.gameAction)}${e.from?.length ? ` from ${e.from.join(',')}` : ' (tapped)'}`);
    for (const q of c.resolved?.questions ?? []) out.push(`  ? ${q.kind} to ${q.askPlayer}: ${q.text}`);
    const b = c.board?.summary;
    if (b) {
      for (const w of b.warnings) out.push(`  ! ${w}`);
      out.push(`  Battlefield: ${b.battlefield.join(', ') || 'nothing'}`);
      if (b.stack.length) out.push(`  Stack: ${b.stack.join(', ')}`);
      out.push(`  Life: ${Object.entries(b.life).map(([id, life]) => `${id} ${life}`).join(', ')}`);
    }
  }
  const interpretations = dump.interpretations ?? [];
  if (interpretations.length) {
    out.push('', `Interpretations (newest last, ${interpretations.length} kept):`);
    for (const r of interpretations) {
      out.push(`  turn ${r.turn} v${r.transcriptVersion} ${r.model} ${(r.latencyMs / 1000).toFixed(1)}s${r.error ? ` FAILED: ${r.error}` : ''}`);
      if (r.answer) out.push(`    ${r.answer.length > 400 ? `${r.answer.slice(0, 400)}…` : r.answer}`);
    }
  }
  return out.join('\n');
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const dumpCommand = new Command('dump')
  .description("Fetch a game's debug dump (ADR 0117): a code or the game's URL, local unless --prod or an onthestack.gg URL")
  .argument('<game>', 'game code or URL')
  .option('--prod', 'read onthestack.gg (needs DEBUG_TOKEN); STX_SERVER_URL points elsewhere, e.g. a Preview')
  .option('--summary', 'print a readable digest instead of the JSON')
  .option('--out <file>', 'write the JSON to a file')
  .action(async (target: string, opts: { prod?: boolean; summary?: boolean; out?: string }) => {
    const { code, base } = parseTarget(target, !!opts.prod);
    const token = base === PROD ? debugToken() : undefined;
    if (base === PROD && !token) {
      console.error('Set DEBUG_TOKEN (in the environment or packages/server/.env) to read production dumps.');
      process.exit(1);
    }
    let res: Response;
    try {
      res = await fetch(`${base}/api/games/${encodeURIComponent(code)}/debug`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    } catch {
      console.error(`Couldn't reach ${base}. ${base === LOCAL ? 'Is `stx start` running?' : ''}`);
      process.exit(1);
    }
    if (!res.ok) {
      console.error(`${res.status}: ${await res.text()}`);
      process.exit(1);
    }
    const dump = await res.json();
    if (opts.out) writeFileSync(opts.out, JSON.stringify(dump, null, 2));
    if (opts.summary) console.log(summarize(dump));
    else if (!opts.out) console.log(JSON.stringify(dump, null, 2));
  });

export const gameCommand = new Command('game').description('Look into a game').addCommand(dumpCommand);
