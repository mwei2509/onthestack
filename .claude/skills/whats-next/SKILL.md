---
name: whats-next
description: Find the issues an agent can pick up now without colliding with open PRs or other sessions, and offer them as options. Use when asked what's next, what to work on, or what can be started in parallel.
---

Work out what's free to start, then let the user choose. Read-only until they pick.

## 1. Gather

- Run `.claude/skills/whats-next/gather.sh`. It prints open PRs with the files each changes, recent merges, open issues and every worktree (uncommitted files, last commit, its PR's state).
- Call `ListAgents` for the other sessions and whether each is busy or idle.
- For each open issue labelled `ready-for-agent` or `needs-triage`, read the body and comments (`gh issue view <n> --comments`): its planned stack, "Blocked by", decisions settled or still to settle, and which packages it will touch.

Done when every open issue has a known planned stack (or none), blockers, decision state and footprint (packages or files).

## 2. Sort every open issue into one bucket

- **Finished but open:** every PR in its plan has merged. Offer to check its acceptance boxes and close it.
- **In flight:** an open PR, a worktree with uncommitted files or a recent commit, or a busy session is on it. Name who.
- **Blocked:** a "Blocked by" issue is open, or a step it builds on hasn't merged.
- **Collides:** its footprint overlaps the files of an open PR or of a worktree with uncommitted changes. Name the PR or worktree, and what it unblocks once merged.
- **Free:** none of the above. Note whether it needs a decision round first (`.claude/rules/design-decisions.md`) or can be built straight away.
- `ready-for-human` issues are the user's; list them in one line.

## 3. Present

Write a short report: one line per issue in **Free** and **Finished but open**, then **Collides** and **Blocked** with what they wait on, then housekeeping (worktrees whose PR merged: `stx wt prune`).

Then call `AskUserQuestion` with up to four picks, the recommended one first, each description saying whether it starts with a decision round or with code. Prefer the critical path to the next milestone, then small settled work.

## 4. Start the pick

- Make its worktree from the main clone with `stx wt create <branch> --print-path` (or `stx wt create <existing-branch>` to pick up a branch). Do every edit, build and commit under the path it prints (`.claude/rules/worktrees.md`).
- Plan and stack its PRs under `.claude/rules/pull-requests.md`, settling any decisions first.
