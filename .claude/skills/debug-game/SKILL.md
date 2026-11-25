---
name: debug-game
description: Work out what went wrong in one game of On The Stack, from its URL (localhost:5190/g/… or onthestack.gg/g/…), its code, or a report id. Use when the user links a game, mentions a report, or asks why the board, life or a reading didn't match what happened at the table.
---

Trace the game's **chain** for the moment in question: what was said → what the interpreter read → what resolving made of it → what the engine did → what the board shows. Find the first link that breaks and explain it with evidence. Read-only until the user picks a fix.

## 1. Get the game

- **A URL or code:** `stx game dump <url-or-code> --summary`, then `--out <scratchpad>/game.json` for the full JSON. An onthestack.gg URL reads production (needs `DEBUG_TOKEN`); anything else reads the local Worker, which must be running (`stx start`).
- **A report:** `stx reports` to find it, then `stx reports show <id> --summary` (`--remote` for production). The report's text is what the player expected; its dump is the game when they sent it.
- **No `stx` or no server:** say so and stop. The `?debug` panel is the fallback the user can read out.

Done when you have each turn's statements, the readings (`interpretations`: the user message sent and the raw answer), the resolved timeline and questions, the RulesWarnings, the battlefield, the Stack and life totals.

## 2. Walk the chain

For the turn and statement the user means, check each link in order, and quote the evidence for each:

1. **Said:** the statement's text, its seat, and `answering` if it was an answer.
2. **Sent:** what the interpreter was given. Check the board it was shown, the card list ("none known" means the game has no card data) and the open questions.
3. **Read:** the raw answer. Look for a dropped action, a misheard card name, the wrong Step, a name where an id belongs, a question that should have been a reading, or the reverse.
4. **Resolved:** the entries that survived, and the questions resolving added (those come from our code, not the model).
5. **Engine:** RulesWarnings, the Stack (an unknown card resolves to nowhere), and what the rules engine does or doesn't model for that card.
6. **Shown:** the battlefield and life against what the user expected.

Re-read the user's expectation against the game before blaming the app: the wrong seat, the wrong turn or a card that never resolved explain many reports. Done when one link is named as the break, with its evidence, or every link checks out and you say so.

## 3. Place the cause

- Name the layer: interpreter prompt or model, resolver, engine rule, missing card data, missing card Translation, a feature not built yet, or the web app.
- Check whether it's known: `gh issue list --state open` and the ADRs in `docs/adr/` for that area. Cite the issue or ADR that covers it.

## 4. Report

Lead with the story in a few sentences: what the player expected, what happened at each link, and where it broke, quoting the log. Then the cause and its issue or ADR. Then fixes, each marked "design decision" when `.claude/rules/design-decisions.md` says it is. Ask before building one.

A live reproduction against the model (an eval case, or a statement on a local game) costs real API calls; say so before running one.
