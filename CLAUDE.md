# On The Stack

Voice-driven Magic: The Gathering table companion for casual Commander (onthestack.gg). Players speak their actions. The app tracks life, combat, triggers and the stack.

**Status:** pre-code. The repo is a pnpm workspace (TypeScript): `packages/engine` (pure rules engine, game setup only so far), `packages/server` (Cloudflare Worker plus the `Game` Durable Object), `packages/web` (React app served by the Worker) and `packages/cli` (the `stx` dev CLI). Nothing is deployed yet. The stack is recorded in `docs/adr/`. Still ask before adding dependencies, and record significant choices as ADRs.

## Dev CLI: `stx` (`packages/cli`)

| Command | Description |
| ------- | ----------- |
| `stx claude [-o \| -e] [args…]` | Launch Claude Code at the checkout root (`-o` skip permissions, `-e` accept edits). Other args pass through. |
| `stx wt <branch>` | Create the worktree if missing, otherwise enter it. Worktrees live in `../onthestack-worktrees/` (override with `STX_WORKTREE_DIR`). |
| `stx start [--no-open]` | Run the local Worker (:8790) and Vite (:5190) in a new iTerm2 tab split into two panes (inline with prefixed output elsewhere), then open the browser. Offers to stop whatever already holds those ports. |
| `stx wt go \| rm \| list \| prune <…>` | Enter, remove, list, or prune worktrees whose branches have merged. |
| `pnpm cli:link` | Rebuild `stx` and symlink it to `~/.local/bin/stx`. |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test` | Run across all packages. CI (`.github/workflows/ci.yml`) runs all four on every PR; the server tests need the web build. |
| `pnpm --filter @onthestack/server dev` + `pnpm --filter @onthestack/web dev` | What `stx start` runs: the local Worker (game sockets, `/api`) and the Vite dev server, which proxies `/api` to it. The Worker serves `packages/web/dist`, so run `pnpm build` first. |

`stx wt` can only `cd` your shell if `eval "$(stx shell-init)"` is in your rc file.

## Docs

- [`GLOSSARY.md`](GLOSSARY.md): the domain language. Use its terms in code, issues and tests.
- `docs/adr/`: architecture decision records, one file per decision (`NNNN-short-title.md`). They take precedence over the proposal. If a decision changes something, write a new ADR rather than editing an old one or the proposal.
- [`docs/proposal.md`](docs/proposal.md): the original dictated first draft (data structures, engine loop, combat). Useful background, but read the ADRs and glossary first; much of its product shape has been superseded.

## Non-negotiable principles

These come from the proposal as amended by `docs/adr/`, and override reasoning from first principles:

1. **The AI translates and the code decides.** An LLM only turns the turn's conversation into a schema-validated timeline of literal Actions, and card Oracle text into a validated Translation. All rules logic and every calculation (damage, deaths, triggers) lives in a deterministic engine. No game logic in prompts.
2. **Never guess.** Unmodeled cards and ambiguous input become a Question or Task for the players ("check this card", "which zombie?"), never an assumption.
3. **Flag, don't block.** Illegal-looking actions raise a Warning with "Do it anyway". Players can always do it anyway or Edit the board, and that is recorded in the history.
4. **Players decide, the app tallies.** Never suggest moves, highlight legal plays or list options. The Rules assistant answers rules questions and refuses strategy.
5. **The physical board is the source of truth.** The app keeps a correctable copy; Edits are always available.
6. **Take-backs work within a turn.** Players undo by saying so or by tapping to fix an item; the engine replays the turn from its starting snapshot. Sealed turns keep one snapshot, a read-only history and a summary, and can only be Edited (ADR 0014, 0016).

## Engineering expectations

- Engine code stays pure and side-effect free, so it can be property-tested with fast-check. Lint enforces this in `packages/engine` (`eslint.config.mjs`); pass time, ids and randomness in as inputs.
- Tests sit next to the code they cover as `*.test.ts` in `src/`, in every package.
- Interpreter changes come with eval cases (conversation + board → expected timeline). Card Translation changes come with eval cases (Oracle text → expected Translation).
- Break every issue into small, stacked pull requests that are easy to review one at a time. See `.claude/rules/pull-requests.md`.
- Stay on free tiers. Flag anything that would cost money before adding it.
- Never store raw audio from gameplay, only confirmed commands. The one exception is the opt-in voice eval set, kept outside this repo (ADR 0009).

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `mwei2509/onthestack`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label named after its role (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
