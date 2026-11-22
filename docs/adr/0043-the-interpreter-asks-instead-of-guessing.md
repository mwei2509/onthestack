# The interpreter asks a PlayerQuestion instead of guessing

Status: Accepted (decided with Melissa, 2026-11-22, in the planning session for #38).

Amends ADR 0015 and ADR 0033. Applies principle 2 ("never guess") to the interpreter. Alongside the timeline, the InterpretedTimeline carries the PlayerQuestions the interpreter still needs answered: `{ kind, askPlayer, text, about: PlayerStatementId[] }`. Whatever it isn't sure of is left out of the timeline rather than guessed, so the board never shows a guess.

There is no separate answer path. The asked player speaks again, the answer is the next PlayerStatement, and because every statement triggers a re-read of the whole turn (ADR 0015), the next InterpretedTimeline resolves the question and stops returning it. Each response returns only the questions still open; a question is identified by its kind and the statements it is about, so it stays put on screen across re-reads.

Questions use ADR 0033's typed kinds, so the interpreter's and the engine's questions are one thing on screen and in the history. Those the interpreter needs first are `chooseOption` with card names ("did you say Serra Angel or Savannah Lions?"), `yesNo` ("did Wall of Omens block Fencing Ace?"), `chooseObjects` ("which Zombie?"), `choosePlayers`, `chooseNumber` and `tellHidden`, plus one new kind for timing, `whichStep` ("was the Shock before or after first-strike damage?").

A question may list readings of what was said, never legal plays or suggestions (principle 4).

## Consequences

- Interpreter evals (ADR 0039) include cases whose expected output is a question. Guessing where a question was expected fails, and so does asking when the board makes the statement clear, so both guessing and over-asking are measured.
- The schema and evals arrive with the interpreter package (#38), questions on screen with typed statements (#43), and the engine's own questions with #54.
