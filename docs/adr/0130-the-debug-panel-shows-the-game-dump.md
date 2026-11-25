# The debug panel shows the game's dump

Status: Accepted (decided with Melissa, 2026-11-24, in the session that built #45)

Amends ADR 0109. Besides the last interpretations, the `?debug` panel has a **Game state** tab: the whole game as JSON, the same dump `stx game dump` reads (ADR 0117), with Refresh and Copy. It keeps up as the board changes.

The tab fetches `GET /api/games/<code>/debug`, so ADR 0117's protection stays as it is: the dump opens on a local Worker, and on onthestack.gg without the `DEBUG_TOKEN` the tab shows the refusal. `stx game dump` with the token reads production.

The dump leaves out the Decks' cards, which games load from their Deck versions (ADR 0119).

## Considered options

- **Send the dump over the game's socket, like interpretations:** works in production for anyone in the game, so the token would no longer protect it.
