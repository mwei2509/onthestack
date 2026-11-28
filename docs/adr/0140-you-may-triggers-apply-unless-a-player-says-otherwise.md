# "You may" triggers apply unless a player says otherwise

Status: Accepted (decided with Melissa, 2026-11-28, in the session building #52)

A triggered ability marked `optional` in its Translation ("you may gain 1 life", "you may put a +1/+1 counter on it") resolves like any other: the engine applies its effects. Players take far more of these than they decline. A player who declined says so ("I don't put the counter on") or marks the readback note Not right (ADR 0137), and the interpreter takes it back within the turn (ADR 0014).

The Stack item carries `optional`, so its readback note can say the ability was a "may".

## Considered options

- **Read it from the conversation, else a PlayerTask** (as with shock lands, ADR 0133, and unknown targets, ADR 0138): never applies a choice nobody stated, but asks about every "may" nobody mentioned, which is most of them.
- **Always an Oracle reminder:** never asks, but a "may" nobody mentioned would be silently skipped.
