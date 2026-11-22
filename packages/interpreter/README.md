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
