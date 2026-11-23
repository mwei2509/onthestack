# Skipping a trigger is a TimelineCorrection

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

Amends ADR 0014, where a TimelineCorrection removes or fixes an item on the turn's timeline, that is, something players said. "Not right" on a readback note (ADR 0057) takes back a triggered ability the engine found by itself, which nobody said. So a TimelineCorrection can also skip a trigger: it names the trigger by the ability and the GameEvent that triggered it, and replaying the turn leaves that trigger out, along with everything that followed from it.

Like any TimelineCorrection, it holds for the rest of the turn unless a player takes it back by saying so. It only skips the trigger: if the card's Translation is wrong in general, that's fixed in the Translation, not the game.

## Consequences

- The engine needs a way to suppress one pending trigger during replay, keyed so it's stable across re-reads of the turn.
- Built with take-backs and TimelineCorrections (#49).
