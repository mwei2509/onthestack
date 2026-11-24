# On The Stack

Voice-driven Magic: The Gathering table companion for casual Commander (onthestack.gg). Players speak their actions. The app tracks life, combat, triggers and the stack.

**Status:** pre-code. The repo is a pnpm workspace (TypeScript): `packages/engine` (pure rules engine), `packages/interpreter` (turns the TurnTranscript into an InterpretedTimeline with an LLM; schema, name resolution, prompt and LLM providers so far), `packages/server` (Cloudflare Worker plus the `Game` Durable Object), `packages/web` (React app served by the Worker) and `packages/cli` (the repo-specific `stx` commands). `main` deploys to onthestack.gg on every merge ([`docs/deploy.md`](docs/deploy.md)). The stack is recorded in `docs/adr/`. Still ask before adding dependencies, and record significant choices as ADRs.

## Dev CLI: `stx`

On the maintainer's machine `stx` is a shell function from a personal CLI kept outside this repo (`mels-skillz`). It provides the generic commands below and forwards everything else to `packages/cli`, which only holds what is specific to this repo.

| Command | Description |
| ------- | ----------- |
| `stx claude [-o \| -e] [args…]` | Launch Claude Code in the current worktree, or the main clone from anywhere else (`-o` skip permissions, `-e` accept edits). Other args pass through. |
| `stx wt <branch>` | Create the worktree if missing, otherwise enter it. Worktrees live in `../onthestack-worktrees/`. |
| `stx wt create <branch> --print-path` | What agents run: creates the worktree (from `origin/main`, or checks out an existing branch), installs, and prints its path instead of entering it. |
| `stx wt go \| rm \| list \| prune <…>` | Enter, remove, list, or prune worktrees whose branches have merged. |
| `stx stack sync [-n]` | After a PR in a stack merges, rebase every branch above it and force-push them. See `.claude/rules/pull-requests.md`. |
| `stx start [--no-open]` | (`packages/cli`) Run the local Worker (:8790) and Vite (:5190) in a new iTerm2 tab split into two panes (inline with prefixed output elsewhere), then open the browser. Offers to stop whatever already holds those ports. |
| `pnpm cli:build` | Rebuild `packages/cli`. `stx` runs the main clone's build, so rebuild there after pulling changes to it. |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test` | Run across all packages. CI (`.github/workflows/ci.yml`) runs all four on every PR, then deploys `main`; the server tests need the web build. |
| `pnpm --filter @onthestack/server dev` + `pnpm --filter @onthestack/web dev` | What `stx start` runs: the local Worker (game sockets, `/api`; it applies pending D1 migrations to the local database first) and the Vite dev server, which proxies `/api` to it. `stx start` also builds `packages/web/dist` first, which the Worker serves; run that build yourself if you start these by hand. |

## Docs

- [`GLOSSARY.md`](GLOSSARY.md): the domain language. Use its terms in code, issues and tests.
- [`docs/engine-model.md`](docs/engine-model.md): the engine spec: domains, the event loop, Steps, the Stack, combat, GameEvents, Ability definitions, data structures, engine functions, property tests and a worked example. Read it before working on `packages/engine` or `packages/interpreter`.
- `docs/adr/`: architecture decision records, one file per decision (`NNNN-short-title.md`), each with a `Status:` line. Only Accepted ones are decided. They take precedence over the proposal. If a decision changes something, write a new ADR rather than editing an old one or the proposal.
- [`docs/deploy.md`](docs/deploy.md): how `main` reaches onthestack.gg, and the one-time Cloudflare and GitHub setup.
- [`docs/proposal.md`](docs/proposal.md): the original dictated first draft (data structures, engine loop, combat). Useful background, but read the ADRs and glossary first; much of its product shape has been superseded.

## Non-negotiable principles

These come from the proposal as amended by `docs/adr/`, and override reasoning from first principles:

1. **The AI translates and the code decides.** An LLM only turns the TurnTranscript into a schema-validated InterpretedTimeline of GameActions, and card Oracle text into a validated Translation. All rules logic and every calculation (damage, deaths, triggers) lives in a deterministic engine. No game logic in prompts.
2. **Never guess.** Unmodeled cards and ambiguous input become a PlayerQuestion or PlayerTask for the players ("check this card", "which zombie?"), never an assumption.
3. **Flag, don't block.** Illegal-looking GameActions raise a RulesWarning with "Do it anyway". Players can always do it anyway or make a BoardCorrection, and that is recorded in the history.
4. **Players decide, the app tallies.** Never suggest moves, highlight legal plays or list options. The Rules assistant answers rules questions and refuses strategy.
5. **The physical board is the source of truth.** The app keeps a correctable copy; BoardCorrections are always available.
6. **Take-backs work within a turn.** Players take things back by saying so or with a TimelineCorrection; the engine replays the turn from its starting snapshot. Sealed turns keep one snapshot, a read-only history (including GameEvents) and a summary, and only change through BoardCorrections (ADR 0014, 0016, 0019).

## Engineering expectations

- Every piece of work, however small, starts in its own worktree made with `stx wt create <branch> --print-path`, and every edit, build and commit happens under the path it prints. The main clone stays on `main` and is never edited. See `.claude/rules/worktrees.md`.
- Engine code stays pure and side-effect free, so it can be property-tested with fast-check. Lint enforces this in `packages/engine` (`eslint.config.mjs`); pass time, ids and randomness in as inputs.
- Tests sit next to the code they cover as `*.test.ts` in `src/`, in every package.
- Interpreter changes come with eval cases (conversation + board → expected timeline). Card Translation changes come with eval cases (Oracle text → expected Translation).
- Break every issue into small, stacked pull requests that are easy to review one at a time. See `.claude/rules/pull-requests.md`.
- Design decisions are made with the user, never silently: ask before building, record each as an ADR, and only she accepts one. See `.claude/rules/design-decisions.md`.
- Stay on free tiers. Flag anything that would cost money before adding it.
- Never store raw audio from gameplay, only confirmed commands. The one exception is the opt-in voice eval set, kept outside this repo (ADR 0009).

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `mwei2509/onthestack`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label named after its role (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
