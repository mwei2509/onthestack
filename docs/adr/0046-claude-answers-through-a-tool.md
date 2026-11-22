# Claude answers through a tool; spell effects are a fixed subset

Status: Proposed

Amends ADR 0041. Found in the first live eval run (#38, part 6).

- **Claude returns the InterpretedTimeline as the input to a non-strict tool, not through structured output.** Claude's structured output rejected the schema twice: first because it was recursive, then, with the recursion removed, because the compiled grammar was too large. A non-strict tool takes the same JSON Schema without compiling a grammar. Zod still validates every answer (ADR 0037), so a malformed answer fails the same way it did before. With this, Claude Haiku 5.5 passed 18–20 of the 22 cases in the first runs, at about $0.0065 per run.
- **A spell's effects can be any GameAction except casting, combat and land drops.** Spells carry their stated effects (ADR 0024). Leaving `cast`, `attack`, `block`, `noBlock`, `doneAttacking`, `divideDamage` and `playLand` out of a spell's effects removes the recursion and halves the schema. No spell in M1's scope needs them; a spell that copies or casts another ("cast a copy") would be stated as a second `cast`.

## Considered options

- **Shrink the schema until structured output accepts it:** drops descriptions and optional fields the model relies on, and would break again as the schema grows.
- **Ask for JSON in the prompt and parse the text:** works without a tool, but nothing makes the model answer in JSON only.
