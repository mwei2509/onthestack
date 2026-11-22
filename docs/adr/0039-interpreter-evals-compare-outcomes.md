# Interpreter evals compare outcomes, not text

Status: Accepted (decided with Melissa, 2026-11-22, in the planning session for #38).

An interpreter eval case is a TurnTranscript and a board in, an expected InterpretedTimeline out (ADR 0015). A case passes when the engine, replaying the expected timeline and the model's timeline from the same snapshot, reaches the same board, life totals and RulesWarnings, and the model asked the expected PlayerQuestions (ADR 0043). A per-entry diff is still reported for debugging. Equivalent readings, such as two land drops listed in the other order, aren't marked wrong.
