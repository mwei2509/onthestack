# An ended game is final and refuses changes

Status: Accepted (decided with Melissa, 2026-11-24, in the session that planned #106)

The game records that it ended with **when, in which turn, and by whom**: the seat that confirmed, or nobody for the shared screen. The time comes from the server's clock.

- **Final.** An ended game can't be reopened. Its join code is retired at once (ADR 0095) and may already belong to another game, and the confirm guards against mistakes.
- **Refusals.** Statements, life taps, Next step and Jump to step are refused with "This game has ended." A second End, such as two screens confirming at once, gets "The game has already ended."
- **Still allowed.** Taking a seat and watching, which change nothing in the game. Refusing them would make a device forget its seat when it reloads.
- **Only a started game can end.** Ending from the lobby is refused with "The game hasn't started yet." An abandoned lobby already loses its join code after 24 hours.
- **Nothing else is recorded.** Ending isn't a GameEvent or a TableEvent; conceding (`PlayerLost`) is a different thing. The app doesn't ask who won: players decide, the app tallies.
- **The join code never blocks ending.** Retiring it happens after the game is saved as ended. If that fails, the code stays until the 24-hour rule retires it, and joining with it only opens the read-only game.

## Consequences

- BoardCorrections are no longer always available: an ended game takes no corrections either (ADR 0092).
- My games (ADR 0092) can show when a game ended and in which turn.

## Considered options

- **A phase (lobby, playing, ended) in place of "started":** clearer in the abstract, but every screen reads "started" today.
- **Allow reopening:** undoes a mistaken end, but the join code may be gone and it's a whole flow for a rare case.
- **Allow ending from the lobby:** there's no turn to seal; revisit when My games lists abandoned lobbies.
