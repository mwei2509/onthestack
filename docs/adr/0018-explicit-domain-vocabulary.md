# Explicit names for domain concepts

Status: Accepted (decided with Melissa, 2026-11-21).

Short words like "Command", "Action", "Event", "View", "Warning", "Question", "Task", "Edit" and "Undo" are overloaded in software (Redux actions, DOM events, UI views) and invite confusion with code concepts. The domain uses explicit names instead: PlayerStatement, TurnTranscript, InterpretedTimeline, GameAction, GameEvent, Stack item, Ability definition, TableView, RulesWarning, PlayerQuestion, PlayerTask, TimelineCorrection, BoardCorrection and Take-back. `GLOSSARY.md` defines each and lists the words to avoid.

Earlier ADRs keep the words they were written with: Command is now PlayerStatement, Interpretation is InterpretedTimeline, Action is GameAction, Event is GameEvent, Warning, Question and Task are RulesWarning, PlayerQuestion and PlayerTask, Edit is BoardCorrection, a pinned correction is a TimelineCorrection, and undo is a Take-back.
