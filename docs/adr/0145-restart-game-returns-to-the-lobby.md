# Restart game returns a game in progress to the lobby

Status: Accepted (decided with Melissa, 2026-11-28, in the session building the local seed)

"Restart game" in the Game menu, beside End game, puts a game in progress back in the lobby as if Start had never been pressed. Any seated phone or the Shared screen can use it, after an in-app confirm: "Back to the lobby with the same seats and Decks. Everything played so far is cleared." Nothing undoes it.

- **Kept:** the game code, the seats and their names, each seat's chosen Deck, and the join code while it's still active (ADR 0095).
- **Cleared:** the current turn, every Sealed turn, and the stored interpretations. Life totals and the board come from Start again; players press Start and choose who goes first, picking up each Deck's newest version as Start always does (ADR 0119).
- **Only in progress.** Restart is refused in the lobby ("The game hasn't started yet") and in an ended game ("This game has ended."), which stays final (ADR 0101).
- **Records.** The cleared turns leave nothing in the game. The Worker logs a `game-restarted` line with who restarted and the turn it was in (ADR 0108). Reports already sent keep their own copy of the game (ADR 0118).
- A reading still in flight when the game restarts is dropped, so it can't land on the new game.

Calling it "Clear game" was rejected as sounding like it deletes the game or its seats. Allowing it on ended games was rejected to keep ADR 0101's ended games final.
