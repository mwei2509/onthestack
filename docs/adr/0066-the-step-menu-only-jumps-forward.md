# The step menu only jumps forward

Status: Accepted (decided with Melissa, 2026-11-23, in the build session for #42).

The jump-to-step menu of ADR 0056 lists only the Steps after the current one in this turn, and the last entry ends the turn the way Next step does on cleanup. Going back to an earlier Step would have to undo what was recorded in the Steps after it, which is a take-back. Take-backs come with voice, as TimelineCorrections (ADR 0014, 0016), not from the step menu.

## Consequences

- Pressing Next step once too often can't be undone from the board until take-backs exist. A BoardCorrection can still fix any count it got wrong.
