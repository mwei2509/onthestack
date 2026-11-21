# Staging and Commit instead of confirming each action

The proposal had every parsed command become a pending action that players confirm. Confirming every Command breaks the flow of play, so everything said during a phase is Staged in a visible queue instead, and moving to the next phase Commits it. Staged items can be edited, removed or reordered; ambiguous input still becomes a Question, never a guess.

## Consequences

- Combat damage is previewed once every defender is Ready and applies on Commit, so it stays simultaneous even though defenders answer one at a time, and responses ("I cast Fog") can land on top before then.
- A trigger's effect on what the app tracks applies on Commit whether or not anyone mentions it. Its physical part becomes a Task, and unresolved Tasks chime at phase change but never block.
