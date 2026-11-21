import { writeFileSync } from 'node:fs';

/**
 * A child process can't change its parent shell's directory, so commands that
 * want to move you (`stx wt <branch>`) write the destination to the file named
 * by STX_CD_FILE and the shell function installed by `stx shell-init` cds
 * there afterwards.
 *
 * Going through a file rather than stdout keeps stdout/stderr inherited, so
 * prompts, `git worktree list` output and pnpm's progress still stream live and
 * in order.
 *
 * Without the shell function the variable is unset and this is a no-op; use
 * `cd "$(stx wt foo --print-path)"` instead.
 */
export function requestCd(dir: string): void {
  const file = process.env.STX_CD_FILE;
  if (!file) return;
  try {
    writeFileSync(file, dir);
  } catch {
    // the wrapper will just not cd — not worth failing the command over
  }
}
