# Pull requests: small and stacked

Applies to every change you open a PR for. The goal is that each PR is easy to review on its own.

## Plan the stack first

- Break each issue or task into a sequence of small PRs before writing code. Post the planned list as a comment on the issue (or in the first PR if there's no issue) so the reviewer sees the whole shape.
- Each PR does one thing: types or a prefactor first, then behaviour, then wiring. Tests and docs go in the same PR as the code they cover.
- Aim for a diff a reviewer can read in one sitting, roughly a few hundred lines. Generated files (lockfiles, generated types) don't count, but say so in the description.

## Design decisions

- Settle the decisions a stack needs before building it, and record them in a docs-only PR at the bottom (`.claude/rules/design-decisions.md`).
- A PR with the `design-decision` label starts its description with a **Decisions** section.

## Stack them

- The first PR targets `main`. Each later PR's base is the previous PR's branch.
- Start each description with its place in the stack: "Part 2 of 4 for #10. Stacked on #15; review that first." The last PR uses "Closes #N"; earlier ones use "Part of #N".
- Every PR in the stack must pass CI on its own.

## After a merge

- PRs are squash-merged and their branches auto-deleted, so GitHub retargets the next PR to `main`. Its branch still contains the old commits: rebase it with `git rebase --onto origin/main <old base branch tip> <branch>`, then `git push --force-with-lease`.
- Right before pushing to any PR branch, check the PR is still open (`gh pr view <n> --json state`). If it merged, put the commits on a fresh branch from `origin/main` and open a new PR instead.
