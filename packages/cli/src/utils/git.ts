import { spawnSync } from 'node:child_process';

/** Run git and capture stdout; null when git fails (not a repo, no such ref, …). */
export function gitOut(args: string[], cwd?: string): string | null {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim();
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
