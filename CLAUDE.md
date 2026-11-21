# On The Stack

Voice-driven Magic: The Gathering table companion for casual Commander (onthestack.gg). Players speak their actions. The app tracks life, combat, triggers and the stack.

**Status:** pre-code. The repo is a pnpm workspace (TypeScript) holding only the `stx` dev CLI so far. The stack is recorded in `docs/adr/`. Still ask before adding dependencies, and record significant choices as ADRs.

## Dev CLI: `stx` (`packages/cli`)

| Command | Description |
| ------- | ----------- |
| `stx claude [-o \| -e] [args…]` | Launch Claude Code at the checkout root (`-o` skip permissions, `-e` accept edits). Other args pass through. |
| `stx wt <branch>` | Create the worktree if missing, otherwise enter it. Worktrees live in `../onthestack-worktrees/` (override with `STX_WORKTREE_DIR`). |
| `stx wt go \| rm \| list \| prune <…>` | Enter, remove, list, or prune worktrees whose branches have merged. |
| `pnpm cli:link` | Rebuild `stx` and symlink it to `~/.local/bin/stx`. |

`stx wt` can only `cd` your shell if `eval "$(stx shell-init)"` is in your rc file.

## Docs

- [`GLOSSARY.md`](GLOSSARY.md): the domain language. Use its terms in code, issues and tests.
- `docs/adr/`: architecture decision records, one file per decision (`NNNN-short-title.md`). They take precedence over the proposal. If a decision changes something, write a new ADR rather than editing an old one or the proposal.
- [`docs/proposal.md`](docs/proposal.md): the original dictated first draft (data structures, engine loop, combat). Useful background, but read the ADRs and glossary first; much of its product shape has been superseded.

## Non-negotiable principles

These come from the proposal as amended by `docs/adr/`, and override reasoning from first principles:

1. **The AI translates and the code decides.** An LLM only turns speech into a schema-validated Command and card Oracle text into a validated Translation. All rules logic lives in a deterministic engine. No game logic in prompts.
2. **Never guess.** Unmodeled cards and ambiguous input become a Question or Task for the players ("check this card", "which zombie?"), never an assumption.
3. **Flag, don't block.** Illegal-looking actions raise a Warning with "Do it anyway". Players can always do it anyway or Edit the board, and that is recorded in the history.
4. **Players decide, the app tallies.** Never suggest moves, highlight legal plays or list options. The Rules assistant answers rules questions and refuses strategy.
5. **The physical board is the source of truth.** The app keeps a correctable copy; Edits are always available.
6. **Undo works within a turn.** The current turn keeps a snapshot per Command; ended turns are Sealed to one snapshot plus read-only history (ADR 0004).

## Engineering expectations

- Engine code stays pure and side-effect free, so it can be property-tested with fast-check.
- Voice-parser changes come with eval cases (transcript → expected Command). Card Translation changes come with eval cases (Oracle text → expected Translation).
- Keep pull requests small and focused.
- Stay on free tiers. Flag anything that would cost money before adding it.
- Never store raw audio from gameplay, only confirmed commands. The one exception is the opt-in voice eval set, kept outside this repo (ADR 0009).

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `mwei2509/onthestack`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label named after its role (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
