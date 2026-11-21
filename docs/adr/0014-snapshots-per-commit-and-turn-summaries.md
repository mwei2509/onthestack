# Snapshots per Commit, and a summary kept for each Sealed turn

Amends ADR 0004. Because the Staged timeline is replayed for every view, the board only needs saving when a phase Commits: a snapshot is a plain copy of the game state, stored once per Commit, plus the Commands that Commit applied. Undoing a Staged Command just removes it; undoing past a Commit restores that snapshot and puts its Commands back in the timeline.

Every Event and stack item records what caused it (a Command, an earlier Event, or a resolving spell or trigger), so undo removes a Command together with everything downstream of it, and the readback can explain why something happened.

When a turn is Sealed, its snapshots collapse as before, but the engine also keeps a small per-player summary of that turn (life gained or lost, creatures that died, spells cast, whether they attacked). Cards that ask about "your last turn" need it, and it can't be rebuilt from collapsed snapshots. "This turn" conditions are answered from the current turn's Events.
