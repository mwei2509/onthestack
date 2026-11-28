# What the app applies on its own is shown as a readback note

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

Amended by ADR 0134 (what gets a note), ADR 0136 (where notes sit, and when they leave the tray) and ADR 0137 ("Not right" until #49). The "Who?" question is superseded by ADR 0138.

When the app resolves something on its own, such as a triggered ability, it applies it immediately and shows a short readback note: "Blood Artist (Priya): Ana loses 1 life, Priya gains 1." Nothing waits for a confirmation or a timer (ADR 0007): the app is a companion that tallies, and players check its work rather than approve each step.

- Notes collect in a tray above the bottom bar on phones and in a side rail on a Shared screen. While a note is open, each affected player's life shows the change beside it (−2).
- Notes stay until someone dismisses them or the turn ends, then they live in the turn's history.
- When the app doesn't know a target, the note asks without blocking: "Blood Artist: target player loses 1 life. Who?", with the players as quick answers. The change is applied only once someone answers. If it's ignored, it stays unanswered in the history and changes nothing (ADR 0025).
- Each note has a "Not right" action that takes that change back (ADR 0058).

A countdown before applying ("applying in 3, 2, 1") was considered and dropped. A board wipe can cause five triggers, and a timer would leave the board half-applied while the table waits on the app, which puts the app in front of the game.

## Consequences

- The readback is the main way players notice a wrong Translation, so a wrong one is visible the first time it fires.
