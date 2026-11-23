# Claude answers through a tool; spell effects are a fixed subset

Status: Accepted (decided with Melissa, 2026-11-22, in the session building #38, after discussing the tool approach and the structured-output limits).

Amends ADR 0041. Found in the first live eval run (#38, part 6).

- **Claude returns the InterpretedTimeline as the input to a non-strict tool, not through structured output.** Claude's structured output rejected the schema twice: first because it was recursive, then, with the recursion removed, because it was too large to compile. The documented limits are 24 optional fields and 16 fields that can take several types, and ours has far more of both. A non-strict tool takes the same JSON Schema without enforcing it while Claude writes; Claude follows it from the description, the long-established way to get structured answers from Claude. Zod validates every answer (ADR 0037), so a malformed answer is never applied. Claude Haiku 5.5 passed 18–22 of the 22 eval cases this way, with no malformed answers.
- **One retry on an invalid answer.** Without enforcement a malformed answer is rare but possible, so the request is sent once more before it counts as a failure. It costs about $0.0003.
- **A spell's effects can be any GameAction except casting, combat and land drops.** Spells carry their stated effects (ADR 0024). Leaving `cast`, `attack`, `block`, `noBlock`, `doneAttacking`, `divideDamage` and `playLand` out of a spell's effects stops the schema referring to itself and halves its size. No spell in M1's scope needs them; a spell that casts another ("cast a copy") is recorded as a second `cast`.

## Considered options

- **Reshape the schema until structured output accepts it:** making every optional field required-but-nullable and reworking player-or-card targets might fit today, but card Translations (M3) add more actions and would break it again.
- **Ask for JSON in the prompt and parse the text:** nothing keeps the model from wrapping the JSON in prose.
- **Register the schema once:** the API has no stored schemas. Prompt caching already makes resending the tool definition nearly free.

## Consequences

Switching back to structured output, if its limits grow, is a change inside the Claude adapter only.
