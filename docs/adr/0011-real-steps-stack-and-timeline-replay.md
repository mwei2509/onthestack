# Real steps, a real stack, and late responses replayed into a timeline

Status: Accepted (decided with Melissa, 2026-11-21).

The engine walks the Comprehensive Rules' steps (untap, upkeep, draw, main, beginning of combat, declare attackers, declare blockers, first-strike and regular combat damage, end of combat, end step, cleanup), and the screen prompts the current one. Turn-based actions happen automatically, "at the beginning of" triggers fire, and combat damage steps run on their own once blocks are done.

Spells and abilities go on a stack, and casting is separate from resolving: `SpellCast` fires when a spell is cast, and a permanent only enters when it resolves. A trigger keeps the information it needs from its source, so it resolves even if the source left; a spell or ability whose targets are all gone fizzles and is marked that way.

A cast spell resolves immediately unless someone responds. Late responses ("in response to that", "after first strike damage", "before blocks") and take-backs are placed in the turn's step-indexed Staged timeline by the conversation interpreter (ADR 0015), and the timeline is replayed from the start of the turn. Because nothing is final until the turn is Sealed (ADR 0016), the engine can walk back and replay without special cases. Moving to the next step resolves anything left on the stack first.

## Considered options

- **Staged order as resolution order, no stack:** simpler, but gets "the enters trigger still resolves after its source is destroyed in response" wrong.
- **Resolve only when the table moves on:** matches casual play loosely, but delays instants that players expect to happen at once.

## Consequences

- State-based actions run between every separate thing that happens, not once per Command, and triggers go on the stack only after they settle, in APNAP order (rules digest, section 3–5).
- The trigger scan includes objects that just left the battlefield, so "dies" triggers can look back.
- Replayed items that become illegal turn into Warnings or Questions; they never disappear silently.
