# A game's debug dump

Status: Accepted (decided with Melissa, 2026-11-24, in the session planning debugging)

`GET /api/games/<code>/debug` returns everything about one game as JSON:

- its setup and the seats' Decks
- each Sealed turn and the current turn: starting snapshot, TurnTranscript, pinned taps, reading, engine timeline, GameEvents and RulesWarnings
- the board now
- the last interpretations (ADR 0109)

`stx game dump <code>` fetches it from the local Worker, and `stx game dump <code> --prod` from onthestack.gg. In production the request needs a `DEBUG_TOKEN` secret (`Authorization: Bearer …`), set once with `wrangler secret put` and kept in the maintainer's local `.env`. Locally, and on Previews without the secret, no token is needed.

## Consequences

- One command gives the whole story of a game, for the maintainer or an agent, instead of reading the debug panel by hand.
- A new Worker secret. Without it, production refuses dumps.

## Considered options

- **A bigger `?debug` panel only:** fine at the table, but nothing an agent can fetch from the terminal.
