# Ending freezes the board where the table is

Status: Accepted (decided with Melissa, 2026-11-24, in the session that planned #106)

Ending a game (ADR 0092) seals the current turn **as of the current Step**, not by replaying through cleanup as End turn does (ADR 0074). If the table ends mid-combat, no combat damage is dealt and no cleanup runs, because none of that happened at the table: the frozen board is the one everyone was looking at. The sealed turn keeps its PlayerStatements, InterpretedTimeline, GameEvents and summary like any other (ADR 0019), and no next turn is started.

The ended board shows no live hints: no combat preview, no reminders such as the draw, no "waiting on" a combat response and no Steps still to come. RulesWarnings already raised stay visible.

Unanswered PlayerQuestions are sealed exactly as they would be at the end of a turn. How a sealed turn shows them is still open (`docs/engine-model.md` section 12).

Life taps still waiting to be sent when the game ends are dropped quietly. Whoever ended the game was looking at the board and accepted it as it stood.

## Consequences

- `sealTurn` can seal through a given Step; End turn keeps sealing through cleanup.
- The ended board comes from the last sealed turn's final board, which is already stored. Nothing is replayed after the end.

## Considered options

- **Seal through cleanup, like End turn:** one code path, but it would deal combat damage and end "until end of turn" effects that the table never got to.
- **Send pending life taps before ending:** keeps a tap made a moment before the confirm, but the person ending had just seen the board.
