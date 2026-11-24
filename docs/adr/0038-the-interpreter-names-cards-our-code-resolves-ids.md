# The interpreter names cards; our code resolves them to IDs

Status: Accepted (decided with Melissa, 2026-11-22, in the planning session for #38).

Amended by ADR 0113 (a player's name reads as that player when only one player has it).

The engine hands out IDs as it replays a turn (ADR 0022), so a creature cast this turn has no ID the LLM could know in advance. The InterpretedTimeline therefore refers to objects the way players do: by card name, with the controller or owner where it helps ("Savannah Lions", Elena's). The interpreter package resolves each reference by replaying the timeline so far with the engine and looking up what is on the board at that point. Identical objects, such as two untouched Zombie tokens, are interchangeable and resolve to either. A reference that still matches different objects becomes a PlayerQuestion (ADR 0043), never a guess.

## Considered options

- **IDs for everything already on the board, plus a way to point at objects created this turn:** works, but asks the LLM to track positional references through a replay it can't see, which is where models slip.
