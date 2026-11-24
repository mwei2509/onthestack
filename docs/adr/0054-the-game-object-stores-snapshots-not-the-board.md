# The Game Durable Object stores the turn's snapshot and timeline, not the board

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

Extended by ADR 0074 (the current Step is stored too).

Applies ADR 0014 to the server. The Game Durable Object stores:

- the game's setup: its code, the seats and their copied Decks, and when it was created
- the current turn's starting snapshot (a game state)
- the current turn's timeline
- each Sealed turn under its own storage key

It never stores the current board. The board is the starting snapshot with the turn's timeline replayed (`replayTurn`), recomputed when something changes. A stored copy of the latest board could drift from the snapshot and timeline it was computed from, and a take-back changes the timeline, so the board would have to be rebuilt anyway.

## Consequences

- One source of truth per turn: replaying the same snapshot and timeline always gives the same board.
- Reading the board costs a replay. A turn is at most a few hundred GameActions, so that's cheap.
