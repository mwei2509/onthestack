# Resolving card names: missing cards are asked about; the action narrows copies

Status: Accepted (decided with Melissa, 2026-11-22, in the session building #38).

Extends ADR 0038 for the two cases it left open.

- **A named card that isn't there.** When the interpreter names something that isn't on the board (or the Stack) at that point in the turn, such as "Murder on Serra Angel" with no Serra Angel in play, the entry is left out and the speaker gets a `chooseObjects` PlayerQuestion quoting what they said ("I don't see Serra Angel. Which card did you mean?"). It was probably misheard, or the board has drifted from the table; the answer or a BoardCorrection fixes it. A RulesWarning wouldn't help, because there is no object for "Do it anyway" to act on.
- **Copies that differ.** Before asking which copy is meant, the resolver keeps only the copies that fit what the action needs: untapped to attack, block or tap, tapped to untap, attacking to be blocked or to divide damage, controlled by the player attacking or blocking, a spell on the Stack to be countered. It asks only if the remaining copies still differ. This is a fixed rule in code, not the LLM, and it never blocks: if no copy fits, every copy is considered and the engine raises its usual RulesWarnings.
