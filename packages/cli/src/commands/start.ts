import { Command } from 'commander';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { gitOut, worktreeRoot } from '../utils/git.js';
import { dim } from '../utils/color.js';

const SERVER_PORT = 8790;
const WEB_PORT = 5190;

const PACKAGES_NEEDING_DEPS = ['.', 'packages/web', 'packages/server'];

const mtime = (path: string) => statSync(path).mtimeMs;

/**
 * pnpm install is per checkout, and a pull doesn't run it, so a fresh worktree or new
 * dependencies would otherwise only fail inside the panes. pnpm rewrites
 * node_modules/.modules.yaml on every install, even one with nothing to change.
 */
function installReason(root: string): string | undefined {
  const missing = PACKAGES_NEEDING_DEPS.filter((p) => !existsSync(join(root, p, 'node_modules')));
  if (missing.length) return `no node_modules in ${missing.join(', ')}`;
  const marker = join(root, 'node_modules', '.modules.yaml');
  if (!existsSync(marker) || mtime(join(root, 'pnpm-lock.yaml')) > mtime(marker)) {
    return 'pnpm-lock.yaml changed since the last install';
  }
  return undefined;
}

function portPids(ports: number[]): number[] {
  const pids = new Set<number>();
  for (const port of ports) {
    const r = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    for (const line of (r.stdout ?? '').split('\n')) {
      const pid = Number(line.trim());
      if (pid) pids.add(pid);
    }
  }
  return [...pids];
}

function describePid(pid: number): string {
  const cmd = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
  const cwd = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' })
    .stdout.split('\n')
    .filter((l) => l.startsWith('n'))
    .map((l) => l.slice(1))
    .pop();
  return `  pid ${pid}  in ${cwd ?? 'unknown dir'}\n      ${cmd.slice(0, 110)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntilFree(ports: number[], attempts: number): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (portPids(ports).length === 0) return true;
    await sleep(250);
  }
  return false;
}

/** Offer to stop whatever already holds our ports, e.g. `stx start` in another worktree. */
async function freePorts(ports: number[]): Promise<boolean> {
  const pids = portPids(ports);
  if (pids.length === 0) return true;

  console.error(`stx start: ports ${ports.join(', ')} are already in use:`);
  for (const pid of pids) console.error(describePid(pid));

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question('Kill that session and start here instead? [y/N] ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'y') {
    console.error('stx start: leaving the running session alone.');
    return false;
  }

  for (const pid of pids) process.kill(pid, 'SIGTERM');
  if (await waitUntilFree(ports, 20)) return true;

  console.error('stx start: ports still held, sending SIGKILL.');
  for (const pid of portPids(ports)) process.kill(pid, 'SIGKILL');
  if (await waitUntilFree(ports, 8)) return true;

  console.error(`stx start: ports still in use (pids: ${portPids(ports).join(' ')}); not starting.`);
  return false;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// Paths and commands go in as argv so nothing needs escaping inside the AppleScript source.
const ITERM_LAYOUT = `
on run argv
  set serverCmd to item 1 of argv
  set webCmd to item 2 of argv
  set tabTitle to item 3 of argv
  tell application "iTerm2"
    tell current window
      set newTab to create tab with default profile
      tell current session of newTab
        set webPane to split vertically with default profile
        set name to tabTitle & ": server"
        write text serverCmd
      end tell
      tell webPane
        set name to tabTitle & ": web"
        write text webCmd
      end tell
    end tell
  end tell
end run
`;

function openItermLayout(serverCmd: string, webCmd: string, title: string): boolean {
  try {
    execFileSync('osascript', ['-e', ITERM_LAYOUT, serverCmd, webCmd, title], { stdio: 'inherit' });
    return true;
  } catch {
    console.error('stx start: could not drive iTerm2 (is automation allowed for your terminal?).');
    return false;
  }
}

/** Outside iTerm2: run both here, prefixing each line with its source. Ctrl-C stops both. */
function runInline(root: string, serverCmd: string, webCmd: string): Promise<number> {
  const procs = [
    { label: 'server', cmd: serverCmd },
    { label: 'web   ', cmd: webCmd },
  ].map(({ label, cmd }) => {
    // Own process group, so stopping it also stops the pnpm → wrangler/vite processes `sh` starts.
    const child = spawn('sh', ['-c', cmd], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const prefix = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) if (line) process.stdout.write(`${dim(label)} │ ${line}\n`);
    };
    child.stdout.on('data', prefix);
    child.stderr.on('data', prefix);
    return child;
  });

  const stopAll = () => {
    for (const p of procs) {
      if (p.pid === undefined) continue;
      try {
        process.kill(-p.pid, 'SIGTERM');
      } catch {
        // group already gone
      }
    }
  };
  process.on('SIGINT', stopAll);
  process.on('SIGTERM', stopAll);

  return new Promise((resolve) => {
    let exited = 0;
    for (const p of procs) {
      p.on('exit', (code) => {
        stopAll();
        if (++exited === procs.length) resolve(code ?? 0);
      });
    }
  });
}

async function openWhenListening(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if (portPids([SERVER_PORT]).length && portPids([WEB_PORT]).length) {
      spawnSync('open', [`http://localhost:${WEB_PORT}`]);
      return;
    }
    await sleep(500);
  }
  console.error("stx start: servers didn't come up within 60s; check their output.");
}

/**
 * Start the local Worker (game sockets, /api) and the Vite dev server side by
 * side. In iTerm2 they open in a new tab split into two panes; anywhere else
 * they run here with prefixed output. The browser opens once both listen.
 */
export const startCommand = new Command('start')
  .description('Run the local server and web app (split iTerm2 panes when available)')
  .option('--no-open', "don't open the browser")
  .action(async (opts: { open: boolean }) => {
    const root = worktreeRoot();

    const reason = installReason(root);
    if (reason) {
      console.log(dim(`▶ ${reason}; running pnpm install`));
      if (spawnSync('pnpm', ['install'], { cwd: root, stdio: 'inherit' }).status !== 0) {
        console.error('stx start: pnpm install failed; not starting.');
        process.exit(1);
      }
    }

    if (!(await freePorts([SERVER_PORT, WEB_PORT]))) process.exit(1);

    const cd = `cd ${shellQuote(root)}`;
    // The Worker serves packages/web/dist as static assets, so it needs one build before it starts.
    const serverCmd = `${cd} && pnpm --filter @onthestack/web build && pnpm --filter @onthestack/server dev`;
    const webCmd = `${cd} && pnpm --filter @onthestack/web dev`;

    const branch = gitOut(['branch', '--show-current'], root) || basename(root);
    console.log(dim(`▶ stx start in ${root} (server :${SERVER_PORT}, web :${WEB_PORT})`));

    if (process.env.TERM_PROGRAM === 'iTerm.app' && openItermLayout(serverCmd, webCmd, branch)) {
      if (opts.open) await openWhenListening();
      return;
    }

    if (opts.open) void openWhenListening();
    process.exit(await runInline(root, serverCmd, webCmd));
  });
