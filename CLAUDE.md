# On The Stack

Voice-driven Magic: The Gathering table companion for casual Commander (onthestack.gg). Players speak their actions. The app tracks life, combat, triggers and the stack.

**Status:** pre-code. The repo is a pnpm workspace (TypeScript) holding only the `stx` dev CLI so far. The app stack hasn't been chosen yet. Don't scaffold or pick dependencies without asking. Record each choice as an ADR when it's made.

## Dev CLI: `stx` (`packages/cli`)

| Command | Description |
| ------- | ----------- |
| `stx claude [-o \| -e] [args…]` | Launch Claude Code at the checkout root (`-o` skip permissions, `-e` accept edits). Other args pass through. |
| `stx wt <branch>` | Create the worktree if missing, otherwise enter it. Worktrees live in `../onthestack-worktrees/` (override with `STX_WORKTREE_DIR`). |
| `stx wt go \| rm \| list \| prune <…>` | Enter, remove, list, or prune worktrees whose branches have merged. |
| `pnpm cli:link` | Rebuild `stx` and symlink it to `~/.local/bin/stx`. |

`stx wt` can only `cd` your shell if `eval "$(stx shell-init)"` is in your rc file.

## Docs

- [`docs/proposal.md`](docs/proposal.md): the product and architecture proposal (data structures, engine loop, combat, voice layer, phased plan). Read it before designing anything.
- `docs/adr/`: architecture decision records, one file per decision (`NNNN-short-title.md`). If a decision changes something in the proposal, write an ADR rather than silently editing the proposal.

## Non-negotiable principles

These come from the proposal and override reasoning from first principles:

1. **The AI translates and the code decides.** The LLM only turns speech into a schema-validated `Action`. All rules logic lives in a deterministic engine: `(GameState, Action) -> (GameState, Event[], Prompt[])`. No game logic in prompts.
2. **Never guess.** Unmodeled cards and ambiguous input become a prompt to the players ("check this", "which zombie?"), never an assumption.
3. **Flag, don't block.** Illegal-looking actions show a warning with "Do it anyway". Overrides always work and are logged as events with `override: true`.
4. **Players decide, the app tallies.** Never suggest moves, highlight legal plays or list options.
5. **The physical board is the source of truth.** The app keeps a correctable shadow copy.
6. **Event log is replayable.** Replaying the log must rebuild identical state, and undo works through the log.

## Engineering expectations

- Engine code stays pure and side-effect free, so it can be property-tested with fast-check.
- Voice-parser changes come with eval cases (transcript → expected `Action`).
- Keep pull requests small and focused.
- Stay on free tiers. Flag anything that would cost money before adding it.
- Never store raw audio, only confirmed commands.
