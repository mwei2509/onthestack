import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname } from 'node:path';

/** Run git and capture stdout; null when git fails (not a repo, no such ref, …). */
export function gitOut(args: string[], cwd?: string): string | null {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim();
}

/** Run git for its exit status only, discarding output. */
export function gitOk(args: string[], cwd?: string): boolean {
  const r = spawnSync('git', args, { cwd, stdio: 'ignore' });
  return !r.error && r.status === 0;
}

/**
 * Run git with its output going straight to the terminal. Status lines land on
 * stderr so the shell wrapper's stdout stays clean (see `stx shell-init`).
 */
export function gitRun(args: string[], cwd?: string): number {
  const r = spawnSync('git', args, { cwd, stdio: 'inherit' });
  if (r.error) {
    console.error(r.error.message);
    return 1;
  }
  return r.status ?? 0;
}

/** The current checkout's toplevel — inside a linked worktree, that worktree. */
export function worktreeRoot(from = process.cwd()): string {
  const top = gitOut(['rev-parse', '--show-toplevel'], from);
  if (!top) {
    console.error('Not inside a git repository.');
    process.exit(1);
  }
  return top;
}

/**
 * The main clone's toplevel, even when called from inside a linked worktree —
 * every `git worktree` subcommand is run against it. `--git-common-dir` points
 * at the shared `.git`, which lives in the main clone.
 */
export function mainRepoRoot(from = process.cwd()): string {
  const common = gitOut(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    from,
  );
  if (!common) {
    console.error('Not inside a git repository.');
    process.exit(1);
  }
  return dirname(common);
}

/** Absolute path to a file inside the shared git dir (FETCH_HEAD, info/exclude, …). */
export function gitPath(relative: string, cwd?: string): string | null {
  return gitOut(
    ['rev-parse', '--path-format=absolute', '--git-path', relative],
    cwd,
  );
}

export function hasOrigin(repoRoot: string): boolean {
  return gitOk(['remote', 'get-url', 'origin'], repoRoot);
}

/** How long a fetch stays fresh enough to skip the network round trip, in seconds. */
const FETCH_MAX_AGE = 300;

/**
 * Refresh origin's refs, skipping the fetch when we already did one recently.
 * FETCH_HEAD lives in the shared git dir, so back-to-back commands across every
 * worktree only pay for one fetch. A failed fetch is a warning, not an error —
 * we fall back on the refs already on disk. No-op while there's no origin.
 */
export function fetchOrigin(repoRoot: string): void {
  if (!hasOrigin(repoRoot)) return;

  const fetchHead = gitPath('FETCH_HEAD', repoRoot);
  if (fetchHead) {
    try {
      const age = Math.round((Date.now() - statSync(fetchHead).mtimeMs) / 1000);
      if (age < FETCH_MAX_AGE) {
        console.error(`→ skipping fetch (last fetched ${age}s ago)`);
        return;
      }
    } catch {
      // never fetched — fall through
    }
  }

  console.error('→ git fetch origin');
  if (!gitOk(['fetch', '--quiet', 'origin'], repoRoot)) {
    console.error(
      'stx worktree: fetch failed; falling back on the refs we already have',
    );
  }
}

export function hasLocalBranch(repoRoot: string, branch: string): boolean {
  return gitOk(
    ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
    repoRoot,
  );
}

export function hasRemoteBranch(repoRoot: string, branch: string): boolean {
  return gitOk(
    ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`],
    repoRoot,
  );
}
