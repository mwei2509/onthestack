# The engine builds readback notes from GameEvents alone

Status: Accepted (decided with Melissa, 2026-11-27, in the session grilling #173)

A pure engine function turns a turn's GameEvents into structured readback notes: each with its cause, the timeline entry that led to it and its effects, but no text. Every GameEvent records its cause, and the chain ends at a PlayerStatement, a Stack item or a rule, so the function finds the entry from the events and needs nothing else. A note no entry led to, such as an upkeep trigger, belongs to its Step.

The server sends the notes in every update and devices word them, as they do log entries (ADR 0106). Notes are never stored: a Sealed turn's notes are rebuilt from its stored GameEvents (ADR 0019), which is how #122 shows them.

Sending raw GameEvents and having the web follow causes back was rejected because it puts game logic in the web (principle 1). Storing built notes at Seal was rejected as a second copy that could drift from the events.
