# Each interpretation is logged to Workers Logs

Status: Accepted (decided with Melissa, 2026-11-24, in the session looking into a missing RulesWarning)

To see what the interpreter was asked and how it answered, the Game object logs one line per interpretation, and the Worker turns on Cloudflare Workers Logs (`observability` in `wrangler.jsonc`), searchable in the Cloudflare dashboard.

Each line carries:

- the game's code, the turn number and the transcript version it read
- the provider and model
- the user message sent; the system prompt is fixed in code, so only its version (a hash of its text) is logged
- the raw answer, or the error if the interpretation failed
- input and output tokens, and latency

Nothing about audio is logged (ADR 0009). The statements players typed or said are in the user message, as they already are in the game's own record.

## Consequences

- Free, within the Workers Free plan: 200,000 log events a day kept for 3 days today, and from 2026-12-01, 0.5 GB a day kept for 7 days. At the limit Cloudflare stops taking logs until the next day rather than charging. An interpretation's line is a few kilobytes.
- Logs are for the maintainer. Players don't see them; ADR 0109 gives the table its own view.

## Considered options

- **Live tail only** (`wrangler tail`): nothing kept, so a problem noticed after the game is gone.
- **Logging the whole system prompt each time:** about 3 KB more per line for text that only changes with a deploy.
