# An answer keeps the question it answers

Status: Accepted (decided with Melissa, 2026-11-24, after a tapped "Yes" lost its meaning)

Amends ADR 0068.

Tapping one of a question's answer buttons still sends the option as the player's next PlayerStatement (ADR 0068). The statement now also keeps the question's text (`answering` on the PlayerStatement), stored with the TurnTranscript. Every reading shows it beside the answer: `[s5] melissa (p1), answering "Did you play a second Godless Shrine?": "Yes"`.

Each reading re-reads the whole turn but lists only the questions still open. Without this, once "Yes" closed its question, the next reading saw a bare "Yes" and dropped what it had meant.

## Consequences

- `PlayerStatement` gains an optional `answering`. The `statement` device message carries it too, from the answer buttons.
- The prompt reads an answer against the question it shows, even after that question is gone.
- A typed answer has no question attached; it reads as an ordinary statement, as before.

## Considered options

- **Keeping answered questions in the prompt:** the model would still have to work out which question a bare "Yes" answered.
- **Buttons sending a full sentence** written by the model: more for the model to get right up front.
