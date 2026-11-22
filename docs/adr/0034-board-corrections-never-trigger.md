# Board corrections never trigger abilities; late actions happen now

Status: Accepted (decided with Melissa, 2026-11-21, in the design session on the XMage research).

Three different things can sound like "fixing" the game, and the app treats them differently:

- **A BoardCorrection** says how things are ("Heliod has two counters"). It fixes the app's copy and never triggers abilities: the game isn't being replayed.
- **A Take-back** within the current turn ("oops, I didn't attack with that") is re-read and replayed, so triggers are recalculated as if it never happened.
- **A late action** ("I forgot my upkeep trigger") is an ordinary action done now, with its triggers now. Nothing is applied retroactively.

This follows how Magic handles mistakes: casual Commander has no official procedure, and tournament rules fix simple mistakes caught quickly, otherwise leave the game as it is, and never undo anything involving hidden information such as exiled or drawn cards.
