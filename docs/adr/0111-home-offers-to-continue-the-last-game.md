# Home offers to continue the last game

Status: Accepted (decided with Melissa, 2026-11-24, in the session after the debug panel)

Each browser remembers in localStorage the game it was last in, whether seated, watching or still choosing a seat. Home shows one Continue card for it, such as "Continue CLAY-GRAPE-73 · Turn 3" or "… · In the lobby". Tapping the card opens the game, and the seat memory from ADR 0053 takes the device back to its seat.

The card shows only while that game is in the lobby or being played. An ended game, or a code that's no longer a game, is forgotten and the card goes away. Opening an ended game forgets it too.

## Consequences

- `GET /api/games/<code>` now also says where the game is (`status`: lobby, playing or ended) and its turn, so Home can check before showing the card.
- Getting back into a game no longer needs its code or link, after a reload or a dev-server restart.
- Signed-in players will also have My games (ADR 0092), across devices. The Continue card covers Guests and the current device.

## Considered options

- **Open the last game automatically from Home:** quickest, but surprising when you meant to start a new game.
- **The last five games:** more than a single table usually needs. My games will cover history for accounts.
- **Only `stx start` reopening it:** helps the maintainer, not players.
