# The board before voice: manual life and step controls

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

Refined by ADR 0066 (the step menu only jumps forward) and ADR 0067 (quick taps combine).

Until players can speak or type their actions (#43, #44), the board needs controls of its own, or nothing would ever change on it.

- **Life:** each phone has − and + on its own seat's life. A tap is a GameAction, the same as saying "I lose 1 life", so it can trigger abilities.
- **Steps:** the Next step button and a jump-to-step menu appear only on the active player's phone and on Shared screens. If the active player has stepped away and there's no Shared screen, any other phone can still advance their turn from the step menu, behind a confirmation, so the table is never stuck.
- **Corrections:** changing a seat from its detail view (ADR 0059) is a BoardCorrection, which never triggers abilities (ADR 0034).
- **Status cues:** commander damage of 15 or more from one commander is shown in a warning colour. That reports what has already happened, so it isn't highlighting a play (principle 4).

## Consequences

- A tap on − or + and a correction from the detail view behave differently: one can trigger abilities, the other never does. When games know what their cards do, the screen will show what a change would trigger and let the player choose between applying it as an action and just correcting the count (planned with #51).
