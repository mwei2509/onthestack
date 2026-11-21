# Worktrees: the main clone stays on `main`

Applies to every change, however small. The main clone (`onthestack/`) always has `main` checked out and is never edited. All work happens in a worktree made by `stx wt` (see `packages/cli/src/commands/worktree.ts` for where they live).

## Starting work

- If the session is already rooted in a worktree (`git rev-parse --show-toplevel` is not the main clone), work there.
- Otherwise, before touching any file, run `stx wt create <branch> --print-path` from the main clone and work under the path it prints. It branches from `origin/main` (or checks out an existing branch), seeds local config and runs `pnpm install`.
- Bash `cd` does not persist outside the session's working directory, so use absolute paths or `git -C <worktree>` / `cd <worktree> && …` in each command.
- A branch can only be checked out in one place. To pick up an existing branch, run `stx wt create <branch>`; never check it out in the main clone.

## Running the app

`stx start` runs whichever checkout it is started from, so run it from inside the worktree. It builds the web app before starting the Worker, and both Vite and `wrangler dev` hot-reload from there. Dev ports are fixed, so only one checkout can run at a time; `stx start` offers to stop the other one.

## After a merge

`stx wt prune` removes worktrees whose branches have merged. Update the main clone with `git pull --ff-only` and nothing else.
