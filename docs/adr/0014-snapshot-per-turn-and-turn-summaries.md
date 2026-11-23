# One snapshot per turn, and a summary kept for each Sealed turn

Status: Accepted (decided with Melissa, 2026-11-21).

Amends ADR 0004. Amended by ADR 0019 (Sealed turns keep their GameEvents) and ADR 0058 (a TimelineCorrection can also skip a trigger). Because the conversation interpreter re-reads the whole turn after every statement (ADR 0015) and the engine replays the result, the board only needs saving once, at the start of each turn: a snapshot is a plain copy of the game state. Undo is no longer a separate mechanism. Players take things back by saying so, or by tapping an item on the timeline to remove or fix it, which pins the correction.

Every Event and stack item records what caused it (a Command, an earlier Event, or a resolving spell or trigger), so a take-back removes an item together with everything downstream of it, and the readback can explain why something happened.

A turn is Sealed when the next player's first statement arrives. Its final board becomes the next turn's snapshot, its statements and timeline are kept as read-only history, and the engine keeps a small per-player summary of it (life gained or lost, creatures that died, spells cast, whether they attacked). Cards that ask about "your last turn" need that summary, which can't be rebuilt later. "This turn" conditions are answered from the current turn's Events. After a turn is Sealed, its board can only be Edited.
