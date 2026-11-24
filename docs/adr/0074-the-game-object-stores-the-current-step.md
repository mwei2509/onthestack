# The Game Durable Object stores the current Step, and cleanup leads to the next turn

Status: Accepted (decided with Melissa, 2026-11-23, in the build session for #42).

First merged as ADR 0065 (#74), which #77 also used; renumbered. ADR 0066 lets statements move the stored Step forward too.

Extends ADR 0054. `replayTurn` stops at the last Step the timeline reaches, so a turn where nothing has been said yet would never leave untap. The Game Durable Object therefore stores the current Step next to the turn's starting snapshot and timeline, and replays to it (`replayTurn(turnStart, timeline, { currentStep })`). It's an input to the replay, not a copy of the board, so it can't drift from the snapshot and timeline.

- **Next step** moves to the following Step and stores it. Steps the engine skips (first-strike damage when no creature has first strike, combat damage with no attackers) are skipped by Next step too.
- **Next step on cleanup** seals the turn (`sealTurn`) and starts the next player's turn at upkeep. Untap needs nothing from the players, so it is never shown as the current Step, though it still happens in the replay.

This is the board before voice, when there are no statements and no take-backs, so sealing right away loses nothing. Once statements arrive (#43, #47), a turn that has ended is Sealed only when the next player's first statement arrives, as decided on #47, so take-backs keep working until then.

## Consequences

- A turn's stored record is its snapshot, its timeline and its current Step.
- New TimelineEntries are placed in the current Step.
