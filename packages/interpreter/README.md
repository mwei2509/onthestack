# @onthestack/interpreter

Turns a turn's conversation into an InterpretedTimeline with an LLM (ADR 0015, 0043), and resolves it into engine timeline entries (ADR 0038, 0045).

## Evals

Eval cases live in `src/evals/cases/`: a table, a conversation, and the expected reading. `pnpm test` checks that every case is well formed and that a perfect reading passes. It never calls an LLM.

Live evals run on demand (ADR 0042):

```sh
pnpm --filter @onthestack/interpreter eval
```

They use every provider whose key is set, either in `packages/interpreter/.env` (git-ignored) or in the environment:

| Provider | Variables |
| --- | --- |
| Workers AI | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (Workers AI read and edit) |
| Gemini | `GEMINI_API_KEY` |
| Claude | `ANTHROPIC_API_KEY` (paid: use a key with a spend cap, ADR 0040) |

Options:

- `EVAL_PROVIDERS=claude,gemini` picks providers.
- `EVAL_MODEL_WORKERS_AI`, `EVAL_MODEL_GEMINI` and `EVAL_MODEL_CLAUDE` try another model.
- `EVAL_RECORD=1` saves every response.

Results, failures and recordings go to `eval-results/` (git-ignored).

## Drafting Translations

`src/translate/` drafts a card's Translation from its Oracle text (ADR 0131, 0132): a prompt with worked examples, a Zod schema for the answer, and code that numbers the abilities and turns anything that fails a check into `unmodeled`. To try it on real cards (text from Scryfall, Claude by default, keys as for the evals):

```sh
CARDS="Blood Artist|Godless Shrine" pnpm --filter @onthestack/interpreter draft
```

`EVAL_PROVIDERS=gemini` drafts with another provider. Each card prints its Translation, any problems, and the tokens and cost of the call.

## Eval workflow

The **Interpreter evals** GitHub workflow runs the live evals on demand (Actions → Interpreter evals → Run workflow), reading the keys from repository secrets of the same names, and uploads `eval-results/` as an artifact.
