# A player's name reads as that player when only one player has it

Status: Accepted (decided with Melissa, 2026-11-24, after a tap was lost to `controller: "melissa"`)

Amends ADR 0038 (the interpreter names cards; our code resolves them to ids).

The interpreter is asked for player ids (`p1`), but it sometimes writes a player's name (`melissa`), since the transcript shows names. When resolving a reading, any player field (who did it, a card's controller, a player affected, an attack's target, who is asked) that isn't an id but matches exactly one player's name, ignoring case, means that player.

If no player has the name, or two players share it, nothing changes: the player is asked, as before. Seat names aren't required to be unique.

## Consequences

- The prompt now repeats that players are referred to by id in every field.
- Eval tables used names as ids (`theo`), so they couldn't catch the slip. An eval case is now seated like a real game, with ids `p1` and `p2`.

## Considered options

- **Prompt and evals only:** cheaper, but the slip could still lose an action.
- **Asking more clearly:** the player would still be asked about something they said plainly.
