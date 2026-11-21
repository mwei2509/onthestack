# An LLM interprets the whole turn's conversation; the engine calculates

Status: Accepted (decided with Melissa, 2026-11-21).

At a real table, meaning depends on the conversation: "after that creature's first strike" only makes sense next to "this double striker attacks you", people speak out of order, and they take things back ("oops, I didn't mean that", "wait, I forgot my trigger"). Interpreting one Hold-to-talk at a time can't follow that.

So after every new statement, an LLM re-reads everything said during the current turn, each statement tagged with its speaker, and returns the whole turn as an ordered timeline of literal Actions (ADR 0013), each placed in its Step. It is given a summary of the board (cards in play with current stats, keywords and Oracle text), the current Step and Stack, and a short rules primer covering timing words. The output is schema-checked.

The engine replays that timeline (ADR 0011) and does all the calculating: damage, deaths, triggers, state-based actions, Warnings. The LLM never computes outcomes; an outcome a player states ("Y survives") passes through as a claim the engine checks and reconciles, with a Warning if it doesn't add up.

Corrections made by tapping or editing are pinned and sent back with each interpretation, so re-reading can't undo them. A later spoken take-back by the same player can unpin their own item.

## Consequences

- Timing ("in response", "after first strike", "before blocks") and take-backs are the interpreter's job; the engine has no special parsing for them.
- Capture stays Hold-to-talk (ADR 0001): the conversation the interpreter sees is the statements players meant for the app, not ambient table talk.
- Evals are conversations plus a board in, an expected timeline out. This is harder than single commands, which affects which model passes them (ADR 0010).
- Each statement re-sends the turn so far (ADR 0016). Turns are short enough that the cost stays small.
