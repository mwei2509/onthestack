import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  fetchOrigin,
  gitOk,
  gitOut,
  gitPath,
  gitRun,
  hasLocalBranch,
  hasRemoteBranch,
  mainRepoRoot,
} from '../utils/git.js';
import { requestCd } from '../utils/cd.js';
import { exec } from '../utils/proc.js';
import { dim } from '../utils/color.js';

/**
 * Worktrees live in a sibling directory so they stay out of the main repo tree
 * (and out of every tool that walks it). Branch slashes are flattened for the
 * directory name: mwei2509/foo -> mwei2509-foo.
 */
function worktreeDir(mainRoot: string): string {
  return (
    process.env.STX_WORKTREE_DIR ??
    join(dirname(mainRoot), `${basename(mainRoot)}-worktrees`)
  );
}

function worktreePath(mainRoot: string, branch: string): string {
  return join(worktreeDir(mainRoot), branch.replace(/\//g, '-'));
}

/**
 * Gitignored local config a checkout needs to actually run. `git worktree add`
 * only materialises tracked files, so without these a fresh worktree has no
 * database URL and no local Claude settings.
 */
const LOCAL_FILES = ['.env', '.env.local', '.claude/settings.local.json'];

/**
 * Backfill those files from the main clone. Existing files are left alone, so a
 * worktree that has intentionally diverged keeps its own copies.
 */
function seedLocals(mainRoot: string, wtPath: string): void {
  const copied: string[] = [];
  for (const rel of LOCAL_FILES) {
    const src = join(mainRoot, rel);
    const dest = join(wtPath, rel);
    if (!existsSync(src) || existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    copied.push(rel);
  }
  if (copied.length) {
    console.error(
      `→ copied local config from the main clone: ${copied.join(' ')}`,
    );
  }
  seedExcludes(mainRoot, wtPath);
}

/**
 * Backfill every file in the main clone matched by `.git/info/exclude` — the
 * personal, uncommitted ignores such as CLAUDE.local.md — at the same
 * repo-relative path. Deliberately no `--exclude-standard`: only info/exclude's
 * patterns are consulted, so .gitignore'd build output, node_modules and logs
 * stay behind.
 */
function seedExcludes(mainRoot: string, wtPath: string): void {
  const excludeFile = gitPath('info/exclude', mainRoot);
  if (!excludeFile || !existsSync(excludeFile)) return;

  const listed = gitOut(
    ['ls-files', '--others', '--ignored', `--exclude-from=${excludeFile}`],
    mainRoot,
  );
  if (!listed) return;

  const copied: string[] = [];
  for (const rel of listed.split('\n').filter(Boolean)) {
    const src = join(mainRoot, rel);
    const dest = join(wtPath, rel);
    if (!existsSync(src) || existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    copied.push(rel);
  }
  if (copied.length) {
    console.error(
      `→ copied personal excludes from the main clone: ${copied.join(' ')}`,
    );
  }
}

/**
 * Install dependencies in a freshly created worktree. Each one needs its own
 * node_modules: sharing the main clone's would mean a branch that bumps a
 * dependency silently changes every other checkout. pnpm's store makes a
 * warm-cache install cheap.
 *
 * `stx` itself is globally linked from the main clone (`pnpm cli:link`), so a
 * worktree doesn't need to build its own copy of the CLI.
 */
function installDeps(wtPath: string): void {
  if (!existsSync(join(wtPath, 'package.json'))) return;
  console.error('→ pnpm install');
  if (exec('pnpm', ['install'], wtPath) !== 0) {
    console.error(
      `stx worktree: pnpm install failed — run it yourself in ${wtPath}`,
    );
  }
}

function create(mainRoot: string, branch: string | undefined): number {
  if (!branch) {
    console.error(
      "stx worktree create: missing branch name (e.g. 'stx wt create my-branch')",
    );
    return 1;
  }

  const wtPath = worktreePath(mainRoot, branch);
  let created = false;

  if (existsSync(wtPath)) {
    console.error(`stx worktree: ${wtPath} already exists; entering it`);
  } else {
    created = true;
    mkdirSync(worktreeDir(mainRoot), { recursive: true });
    // Refresh remote refs first: a new branch should start from the freshest
    // origin/main, and an already-pushed branch should be found as
    // origin/<branch> rather than silently recreated from main.
    fetchOrigin(mainRoot);

    let add: string[];
    if (hasLocalBranch(mainRoot, branch)) {
      add = ['worktree', 'add', wtPath, branch];
      console.error(
        `→ git worktree add ${wtPath} ${branch} (existing local branch)`,
      );
    } else if (hasRemoteBranch(mainRoot, branch)) {
      add = [
        'worktree',
        'add',
        '--track',
        '-b',
        branch,
        wtPath,
        `origin/${branch}`,
      ];
      console.error(
        `→ git worktree add --track -b ${branch} ${wtPath} origin/${branch}`,
      );
    } else if (hasRemoteBranch(mainRoot, 'main')) {
      // --no-track: branching off origin/main would otherwise set it as the
      // upstream, so `git status` compares against main and a bare `git push`
      // can aim at the wrong branch.
      add = [
        'worktree',
        'add',
        '--no-track',
        '-b',
        branch,
        wtPath,
        'origin/main',
      ];
      console.error(
        `→ git worktree add --no-track -b ${branch} ${wtPath} origin/main (new branch from origin/main)`,
      );
    } else if (hasLocalBranch(mainRoot, 'main')) {
      add = ['worktree', 'add', '-b', branch, wtPath, 'main'];
      console.error(
        `→ git worktree add -b ${branch} ${wtPath} main (no origin/main; from local main)`,
      );
    } else {
      add = ['worktree', 'add', '-b', branch, wtPath];
      console.error(
        `→ git worktree add -b ${branch} ${wtPath} (no origin/main; from HEAD)`,
      );
    }

    const code = gitRun(add, mainRoot);
    if (code !== 0) return code;
  }

  seedLocals(mainRoot, wtPath);
  if (created) installDeps(wtPath);

  requestCd(wtPath);
  console.error(dim(`→ ${wtPath}`));
  return 0;
}

function go(mainRoot: string, branch: string | undefined): number {
  if (!branch) {
    console.error(
      "stx worktree go: missing branch name (e.g. 'stx wt go my-branch')",
    );
    return 1;
  }

  const wtPath = worktreePath(mainRoot, branch);
  if (!existsSync(wtPath)) {
    console.error(
      `stx worktree: no worktree at ${wtPath} (create it with 'stx wt create ${branch}')`,
    );
    return 1;
  }

  seedLocals(mainRoot, wtPath);
  requestCd(wtPath);
  console.error(dim(`→ ${wtPath}`));
  return 0;
}

function remove(mainRoot: string, branch: string | undefined): number {
  if (!branch) {
    console.error(
      "stx worktree remove: missing branch name (e.g. 'stx wt rm my-branch')",
    );
    return 1;
  }

  const wtPath = worktreePath(mainRoot, branch);
  if (!existsSync(wtPath)) {
    console.error(`stx worktree: no worktree at ${wtPath}`);
    return 1;
  }

  // If the calling shell is sitting inside the worktree being removed, send it
  // back to the main clone so git isn't deleting its cwd out from under it.
  if (process.cwd().startsWith(wtPath)) requestCd(mainRoot);

  console.error(`→ git worktree remove ${wtPath}`);
  return gitRun(['worktree', 'remove', wtPath], mainRoot);
}

/**
 * Whether a branch's work has already landed on main, with a short reason when
 * it has. Two signals are needed: a squash-merged branch is *not* an ancestor of
 * main, while a branch merged without a PR never shows up in `gh`.
 */
function mergeStatus(mainRoot: string, branch: string): string | null {
  if (
    gitOk(
      ['merge-base', '--is-ancestor', `refs/heads/${branch}`, 'origin/main'],
      mainRoot,
    )
  ) {
    return 'merged into main';
  }

  const gh = spawnSync(
    'gh',
    [
      'pr',
      'view',
      branch,
      '--json',
      'state,number',
      '-q',
      '.state + " " + (.number|tostring)',
    ],
    { cwd: mainRoot, encoding: 'utf8' },
  );
  if (!gh.error && gh.status === 0) {
    const [state, number] = gh.stdout.trim().split(' ');
    if (state === 'MERGED') return `PR #${number} merged`;
  }

  return null;
}

/** Parse `git worktree list --porcelain` into (path, branch) pairs. */
function listWorktrees(
  mainRoot: string,
): { path: string; branch: string | null }[] {
  const out = gitOut(['worktree', 'list', '--porcelain'], mainRoot) ?? '';
  const trees: { path: string; branch: string | null }[] = [];
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      trees.push({ path: line.slice('worktree '.length), branch: null });
    } else if (line.startsWith('branch refs/heads/')) {
      const current = trees[trees.length - 1];
      if (current) current.branch = line.slice('branch refs/heads/'.length);
    }
  }
  return trees;
}

/**
 * Uncommitted work, ignoring node_modules. A real node_modules directory is
 * already gitignored, but a symlinked one shows up as untracked — the
 * `node_modules/` rule only matches directories and git won't follow the link —
 * and that alone would keep a merged worktree alive forever.
 */
function uncommitted(wtPath: string): boolean {
  const status = gitOut(['status', '--porcelain'], wtPath);
  if (!status) return false;
  return status
    .split('\n')
    .filter(Boolean)
    .some((line) => !/(^|\/)node_modules(\/|$)/.test(line.slice(3)));
}

async function confirm(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${prompt} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

type PruneOpts = {
  dryRun: boolean;
  yes: boolean;
  fetch: boolean;
  branches: boolean;
};

async function prune(mainRoot: string, opts: PruneOpts): Promise<number> {
  if (opts.fetch) {
    if (!gitOk(['fetch', '--quiet', 'origin', 'main'], mainRoot)) {
      console.error(
        'stx worktree prune: fetch failed; falling back on the origin/main we already have',
      );
    }
  }

  // Key off the branch each worktree actually has checked out — the directory
  // name is only the branch it was created for, and those can drift apart.
  const doomed: { path: string; branch: string; reason: string }[] = [];
  for (const { path: wtPath, branch } of listWorktrees(mainRoot)) {
    if (wtPath === mainRoot) continue;
    if (!branch) {
      console.error(`  skipping ${wtPath} (detached HEAD)`);
      continue;
    }

    const reason = mergeStatus(mainRoot, branch);
    if (!reason) continue;

    if (uncommitted(wtPath)) {
      console.error(
        `  skipping ${branch} (${reason}) — worktree has uncommitted changes`,
      );
      continue;
    }

    doomed.push({ path: wtPath, branch, reason });
  }

  if (doomed.length === 0) {
    console.error('stx worktree prune: no merged worktrees to remove');
    return gitRun(['worktree', 'prune'], mainRoot);
  }

  console.error('Merged worktrees:');
  for (const { path: wtPath, branch, reason } of doomed) {
    console.error(`  ${branch} (${reason}) → ${wtPath}`);
  }

  if (opts.dryRun) {
    console.error('(dry run — nothing removed)');
    return 0;
  }

  if (!opts.yes) {
    const what = `Remove ${doomed.length} worktree(s)${
      opts.branches ? ' and delete their local branches' : ''
    }?`;
    if (!(await confirm(what))) {
      console.error('stx worktree prune: aborted');
      return 1;
    }
  }

  let failed = 0;
  for (const { path: wtPath, branch } of doomed) {
    // Step the calling shell out first if it's sitting inside this worktree.
    if (process.cwd().startsWith(wtPath)) requestCd(mainRoot);

    console.error(`→ git worktree remove ${wtPath}`);
    if (!gitOk(['worktree', 'remove', wtPath], mainRoot)) {
      // Plain `remove` refuses on untracked or modified files, which is exactly
      // the symlinked-node_modules case we just decided to tolerate.
      console.error('→ retrying with --force (node_modules)');
      if (gitRun(['worktree', 'remove', '--force', wtPath], mainRoot) !== 0) {
        failed = 1;
        continue;
      }
    }

    // -D rather than -d: a squash-merged branch isn't an ancestor of main, so
    // git considers it unmerged and -d would refuse.
    if (opts.branches) {
      console.error(`→ git branch -D ${branch}`);
      if (gitRun(['branch', '-D', branch], mainRoot) !== 0) failed = 1;
    }
  }

  gitRun(['worktree', 'prune'], mainRoot);
  return failed;
}

const USAGE =
  'stx worktree: usage — <branch> | create <branch> | go <branch> | remove <branch> | prune [--dry-run|--yes|--no-fetch|--branches] | list';

/**
 * Dispatch by hand rather than with commander subcommands, so a bare branch
 * name keeps working as a subcommand would ("create it if missing, otherwise
 * just go there") without every branch name having to be registered.
 */
export const worktreeCommand = new Command('worktree')
  .alias('wt')
  .description('Create, enter, remove and prune git worktrees for branches')
  .argument('[sub]', 'branch name, or create|go|remove|prune|list')
  .argument('[rest...]', 'arguments for that subcommand')
  .option(
    '--print-path',
    'print the destination instead of cd-ing (no shell function needed)',
  )
  .allowUnknownOption()
  .action(
    async (
      sub: string | undefined,
      rest: string[],
      opts: { printPath?: boolean },
    ) => {
      const mainRoot = mainRepoRoot();

      // --print-path turns the cd channel into plain stdout, so the command is
      // usable as `cd "$(stx wt foo --print-path)"` without shell-init.
      if (opts.printPath) delete process.env.STX_CD_FILE;
      const printPath = (dir: string) => {
        if (opts.printPath) console.log(dir);
      };

      switch (sub) {
        case 'create': {
          const code = create(mainRoot, rest[0]);
          if (code === 0 && rest[0]) printPath(worktreePath(mainRoot, rest[0]));
          process.exit(code);
        }
        case 'go': {
          const code = go(mainRoot, rest[0]);
          if (code === 0 && rest[0]) printPath(worktreePath(mainRoot, rest[0]));
          process.exit(code);
        }
        case 'remove':
        case 'rm':
          process.exit(remove(mainRoot, rest[0]));
        case 'prune': {
          const flags: PruneOpts = {
            dryRun: false,
            yes: false,
            fetch: true,
            branches: false,
          };
          for (const arg of rest) {
            switch (arg) {
              case '-n':
              case '--dry-run':
                flags.dryRun = true;
                break;
              case '-y':
              case '--yes':
                flags.yes = true;
                break;
              case '--no-fetch':
                flags.fetch = false;
                break;
              case '--branches':
                flags.branches = true;
                break;
              default:
                console.error(
                  `stx worktree prune: unknown option '${arg}' (try --dry-run, --yes, --no-fetch, --branches)`,
                );
                process.exit(1);
            }
          }
          process.exit(await prune(mainRoot, flags));
        }
        case 'list':
          process.exit(gitRun(['worktree', 'list'], mainRoot));
        case undefined:
        case 'help':
          console.error(USAGE);
          process.exit(sub === undefined ? 1 : 0);
        default: {
          if (sub.startsWith('-')) {
            console.error(
              `stx worktree: unknown flag '${sub}' (try 'stx wt help')`,
            );
            process.exit(1);
          }
          // Anything else is a branch name: create the worktree if it's missing,
          // otherwise just go there.
          const code = create(mainRoot, sub);
          if (code === 0) printPath(worktreePath(mainRoot, sub));
          process.exit(code);
        }
      }
    },
  );
