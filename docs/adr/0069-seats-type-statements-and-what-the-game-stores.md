# Only seated devices type statements; the game stores the transcript and the last reading

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #43).

Amended by ADR 0107 (the Shared screen speaks for a seat).

- **Who can type.** A device holding a seat (ADR 0053) types PlayerStatements as that seat; "I" is that seat's player. A device that is just watching, such as a Shared screen, has no text box.
- **What the Game Durable Object stores**, extending ADR 0054 and 0074: the turn's PlayerStatements (the TurnTranscript), its pinned entries (ADR 0065), and the last applied InterpretedTimeline with the transcript version it read (ADR 0017). The engine timeline, the board and the TableView are always derived from those, never stored.
