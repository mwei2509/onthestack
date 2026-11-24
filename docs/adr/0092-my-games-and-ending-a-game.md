# Accounts list their games, and a game can be ended

Status: Accepted (decided with Melissa, 2026-11-24, in the session that specified accounts)

A signed-in player's "My games" lists every game they created or held a seat in, on any device: in the lobby, in progress or ended, newest first, one tap to get back in. A game can be hidden from your own list without changing it for anyone else.

So that old games stop looking unfinished, a game can now be ended. Anyone at the table can end it, from any seated device or the shared screen, after a confirm, just as anyone can start a game (ADR 0051) or move the Step on. Ending seals the current turn and freezes the game. An ended game opens read-only, with its sealed turns' history (ADR 0019).

## Consequences

- Games remember who created them (their account, if signed in) and when they last changed, for the list.
- Ending is a new step in a game's life. An ended game takes no statements, taps or corrections.

## Considered options

- **No ending, the list sorted by last activity:** less to build, but every game stays "in progress" for ever.
- **Only the creator can end a game:** a game created by a Guest could then never be ended.
