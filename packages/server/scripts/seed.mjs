#!/usr/bin/env node
// The local seed (ADR 0143). Plain JavaScript so `postinstall` can run it in a fresh worktree before anything is built.
//   node scripts/seed.mjs install         load the seed if this checkout has no Decks (postinstall; skipped in CI)
//   node scripts/seed.mjs load            load the seed, replacing what it covers
//   node scripts/seed.mjs save [codes…]   write every local Deck to the seed, keeping its games and adding or
//                                         refreshing the named ones from this checkout; --only keeps just those
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = join(SERVER, 'seed/local.json');
const DEV_PORT = 8790;
// Off the dev ports, so seeding never clashes with a running `stx start`.
const PORT = 8798;
const INSPECTOR_PORT = 9338;
const WRANGLER = join(SERVER, 'node_modules/.bin/wrangler');

const say = (line) => console.error(`seed: ${line}`);

function wrangler(args) {
  const r = spawnSync(WRANGLER, args, { cwd: SERVER, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`wrangler ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

function localDeckCount() {
  const out = wrangler(['d1', 'execute', 'DB', '--local', '--json', '--command', 'SELECT count(*) AS n FROM decks']);
  return JSON.parse(out)[0].results[0].n;
}

/** A Worker this checkout started with `stx start` holds games in memory, so loading or saving underneath it would go stale. */
function devServerHere() {
  const pids = spawnSync('lsof', ['-t', `-iTCP:${DEV_PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  return pids.some((pid) => {
    const cwd = /^n(.*)$/m.exec(spawnSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).stdout)?.[1] ?? '';
    return cwd === SERVER || cwd.startsWith(`${resolve(SERVER, '../..')}/`);
  });
}

/** Runs `fn` against a short-lived local Worker on this checkout's state. */
async function withWorker(fn) {
  // The Worker serves the web build; an empty folder is enough for `/api`.
  mkdirSync(join(SERVER, '../web/dist'), { recursive: true });
  const worker = spawn(WRANGLER, ['dev', '--port', String(PORT), '--inspector-port', String(INSPECTOR_PORT), '--var', 'LOCAL_DEV:true'], { cwd: SERVER, stdio: 'ignore', detached: true });
  const base = `http://localhost:${PORT}`;
  try {
    for (let i = 0; ; i++) {
      if (i > 60) throw new Error('The local Worker did not start');
      if (await fetch(`${base}/api/health`).then((r) => r.ok, () => false)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    return await fn(base);
  } finally {
    process.kill(-worker.pid);
  }
}

async function load() {
  wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '-y']);
  const body = readFileSync(SEED, 'utf8');
  const loaded = await withWorker(async (base) => {
    const res = await fetch(`${base}/api/dev/seed`, { method: 'POST', body });
    if (!res.ok) throw new Error(`Loading the seed failed: ${await res.text()}`);
    return res.json();
  });
  say(`loaded ${loaded.decks} Decks and ${loaded.games.length ? `games ${loaded.games.join(', ')}` : 'no games'}`);
}

async function save(codes, only) {
  wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '-y']);
  const read = await withWorker(async (base) => {
    const res = await fetch(`${base}/api/dev/seed?games=${codes.join(',')}`);
    if (!res.ok) throw new Error(`Reading the seed failed: ${await res.text()}`);
    return res.json();
  });
  // Games already in the seed are kept as they are there, so this checkout doesn't need a copy of each one.
  const kept = only || !existsSync(SEED) ? {} : JSON.parse(readFileSync(SEED, 'utf8')).games;
  const seed = { ...read, games: { ...kept, ...read.games } };
  mkdirSync(dirname(SEED), { recursive: true });
  writeFileSync(SEED, `${JSON.stringify(seed, null, 1)}\n`);
  const games = Object.keys(seed.games);
  say(`saved ${seed.tables.decks.length} Decks and ${games.length ? `games ${games.join(', ')}` : 'no games'} to ${SEED}`);
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'install') {
    if (process.env.CI || !existsSync(SEED)) process.exit(0);
    wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '-y']);
    if (localDeckCount() > 0) process.exit(0);
    await load();
  } else if (command === 'load' || command === 'save') {
    if (devServerHere()) throw new Error('Stop `stx start` in this checkout first: it holds the games in memory.');
    if (command === 'load') await load();
    else await save(args.filter((a) => a !== '--only').map((c) => c.toUpperCase()), args.includes('--only'));
  } else {
    say('usage: seed.mjs install | load | save [--only] [game codes…]');
    process.exit(1);
  }
} catch (e) {
  say(e instanceof Error ? e.message : String(e));
  // A failed seed must never fail `pnpm install`.
  process.exit(command === 'install' ? 0 : 1);
}
