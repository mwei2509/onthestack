# GameEvents for the game, TableEvents for the table

Status: Accepted (decided with Melissa, 2026-11-21, in the design session on E2).

The history holds two kinds of record. A **GameEvent** is a Magic rules happening, documented with the Comprehensive Rules concept it represents: something a rule or trigger reads, or something that changes the board when folded into state. Replaying GameEvents alone rebuilds the board. A **TableEvent** is the app's own record of the table: PlayerTasks, PlayerQuestions asked and answered, RulesWarnings raised, corrections said. TableEvents share the history and its causes, so "why do I have this task?" still works, but triggers never see them and they never change the board.

How often cards listen to a GameEvent is documentation (`docs/research/triggers.md`), not a type distinction; card Translations may listen to any GameEvent. There is no separate "bookkeeping" category.

A BoardCorrection is recorded as a pair: a TableEvent saying who corrected what, and the ordinary GameEvents it produced, caused by that correction. The engine never special-cases a "correction" GameEvent.

GameEvents record outcomes only. There are no "about to happen" events: replacement effects, when they arrive, adjust GameActions before GameEvents are made. There are no separate batch event types: GameEvents already carry arrays, so a "one or more" trigger fires once.

## Considered options

- **One stream with a `kind: 'game' | 'bookkeeping'` flag:** every GameEvent but one turned out to be a real rules event, so the flag drew a line that didn't exist.
- **XMage's "about to happen" / "happened" pairs:** they exist so replacement effects can change an event before it happens; a companion recording the table needs only outcomes.

## Consequences

`PlayerTaskCreated` moves from GameEvent to TableEvent. Research behind this: `docs/research/event-models.md` (Arena, XMage, Forge and Cockatrice all keep rules events apart from table records and player prompts).
