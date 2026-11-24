# Tapped actions are pinned in the timeline

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #43).

A tap on the board (ADR 0056, 0064) records a GameAction straight away, while the interpreter returns the whole turn's timeline afresh after every PlayerStatement (ADR 0015). Without a rule, a re-read could drop a tapped action, or repeat it when someone also says it ("I lose 1 from the Caves" after tapping −1).

Tapped actions are pinned entries, like TimelineCorrections. They are kept on every re-read, placed in the Step they were tapped in and ordered by time among the interpreted entries. The interpreter's prompt lists them as already recorded and tells it not to repeat them, so a statement that only describes a tap that was already made adds nothing.

## Consequences

- The turn's timeline has two sources: pinned entries, which only taps and corrections change, and interpreted entries, replaced on each re-read.
- Interpreter evals gain cases where a statement repeats a tapped action.
