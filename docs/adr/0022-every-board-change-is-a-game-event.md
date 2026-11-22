# Every board change is a GameEvent; derived state is stored and rebuilt by the fold

Status: Accepted (decided with Melissa, 2026-11-21, in the design session reviewing the engine PRs).

The engine changes the board only by folding GameEvents into state, so replaying a turn's GameEvents from its snapshot always rebuilds the identical board. Values derived along the way are stored in the game state rather than recalculated on demand: triggers that have matched a GameEvent and are waiting for the board to settle before going on the Stack, and the counters that hand out IDs. Folding the GameEvents rebuilds both, snapshots include both, and every GameEvent carries the IDs it creates so the counters can always be recalculated. A property test checks that folding a game's GameEvents from scratch reproduces its exact state.

Every rules engine surveyed stores waiting triggers the same way (`docs/research/event-models.md`).
