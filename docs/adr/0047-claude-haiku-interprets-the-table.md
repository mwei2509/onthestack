# Claude Haiku 5.5 interprets the table

Status: Accepted (decided with Melissa, 2026-11-23, in the session building #38).

Chooses the model ADR 0040 left to the evals. Claude Haiku 5.5 interprets PlayerStatements in games. It was the only candidate to pass every eval, and the only one that reliably asks instead of guessing (ADR 0043), which is the behaviour principle 2 depends on.

Results on the 22 interpreter evals (#38, part 6), after tuning the prompt on all three:

| Model | Passed | Median latency | Cost per eval run |
| --- | --- | --- | --- |
| Claude Haiku 5.5 | 22/22 (18–20 in earlier runs) | 2.6 s | $0.0066 |
| Gemini 3.5 Flash-Lite (free tier) | 19/22 (18 in an earlier run) | 1.4 s | free |
| Workers AI, Llama 3.3 70B | 12/22 (11–14 in earlier runs) | 2.9 s | free |

Gemini's failures were the never-guess cases: it guessed when a late Shock happened, passed an unclear card name through, and asked about a name while also casting it. Llama dropped spells' effects, confused `counter` with `counters`, and sometimes returned invalid JSON.

## Consequences

- This is the paid fallback ADR 0010 allowed. An eval case costs about $0.0003; a busy game re-sends a growing turn, so a game costs roughly $1–2 before prompt caching. The key keeps its spend cap of about $5 a month (ADR 0040).
- Nothing at the table goes to a provider that trains on prompts.
- Gemini stays wired up and in the evals as the free alternative; re-run them as the cases grow, and switch if it closes the gap on asking.
- Latency is about 2.6 s per interpretation, above the "about a second" ADR 0017 assumed. Statements still appear at once, marked as being interpreted.
