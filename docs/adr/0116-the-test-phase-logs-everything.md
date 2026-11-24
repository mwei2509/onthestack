# The test phase logs everything

Status: Accepted (decided with Melissa, 2026-11-24, in the session planning debugging)

Extends ADR 0108.

A `TEST_PHASE` var in `wrangler.jsonc` marks the test phase. It's on for production, Previews and local development for now. While it's on, the Game object logs one JSON line per event, each with the game's code, turn and Step:

- every device message: joins, statements, taps, Step moves, answers, end
- every interpretation (ADR 0108's line), and the questions resolving added
- every replay: the RulesWarnings raised, how many GameEvents it produced, and what's on the Stack
- every turn sealed, and every error

Locally the lines appear in the `wrangler dev` terminal; in production, in Workers Logs. Turning `TEST_PHASE` off keeps ADR 0108's interpretation line and errors and drops the rest. The same switch shows the Report button (ADR 0118).

## Consequences

- The web app reads `testPhase` from `GET /api/health`.
- Log volume stays within the free plan's daily allowance for a handful of test games. At the limit, Cloudflare stops taking logs rather than charging.

## Considered options

- **Interpretations and errors only:** quieter, but a board that doesn't match the table (a creature that vanished) still needs digging.
- **Separate switches for logs and the Report button:** both mean "we're testing", so one is enough.
