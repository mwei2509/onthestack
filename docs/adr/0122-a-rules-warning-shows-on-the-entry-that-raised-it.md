# A RulesWarning shows on the timeline entry that raised it

Status: Accepted (decided with Melissa, 2026-11-24, in the session planning #50)

The engine tags each RulesWarning with the timeline entry that raised it: the entry's Step, its player and the statements it came from (`from`). The board shows the warning under that line in This turn's log ("Hinterland Sanctifier has summoning sickness"), and marks the permanent it's about, when there is one, in amber. A warning that no entry raised, such as a possible loop or one from sealing the turn, shows at the top of the log.

Players see which statement caused a warning, including warnings about cards that never reached the battlefield (`unknownCard`). A banner above the board, which would need no engine change, was rejected because it can't show which statement caused the warning. A badge on the permanent alone was rejected because it misses warnings about cards that aren't on the battlefield.
