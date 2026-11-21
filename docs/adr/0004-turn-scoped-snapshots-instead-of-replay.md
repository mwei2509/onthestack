# Turn-scoped snapshots instead of a replayable event log

The proposal required that replaying the event log rebuild identical state, with undo working through the log. For v1 we store a snapshot of game state after every Command in the current turn instead. Undo restores an earlier snapshot of the current turn. When a turn ends it is Sealed: its snapshots collapse to the final one, and its Commands and outcomes are kept as read-only history (confirmed commands only, never audio). After that the board can only be Edited. Ending a turn can be undone until the next player has something Committed.

Snapshots give undo, reconnection and joining mid-game without the engine having to reproduce history exactly. The trade-off is that rebuilding a game by replay is deferred. The engine stays pure, so replay can be added later.

## Consequences

Supersedes proposal principle 6 ("Event log is replayable") for v1.
