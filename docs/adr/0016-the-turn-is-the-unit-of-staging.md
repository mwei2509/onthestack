# The turn, not the phase, is the unit of staging

Supersedes the per-phase Commit in ADR 0007. Everything said during a turn stays Staged until the turn is Sealed. Phase and step changes still happen and are shown, and moving to the next step still resolves anything left on the stack, but they no longer make anything final.

This lets any take-back within the turn work by talking ("wait, back in main 1 I forgot to cast my creature"), since the interpreter re-reads the whole turn (ADR 0015). It also removes per-phase snapshots and a separate undo system: one snapshot per turn, take-backs by conversation or tap-to-fix, and Edits once a turn is Sealed (ADR 0014).

## Consequences

- The interpreter's prompt grows through a turn, to perhaps 50–100 statements in a busy one. That stays cheap, and pinned corrections keep earlier items from drifting.
- ADR 0007's other decision stands: nothing waits for per-action confirmation.
