# Design decisions: made together, recorded, gated

Applies to every session and agent, including the `@claude` GitHub Action. The user wants to understand and weigh in on every design decision. Decisions live in `docs/adr/`; `docs/engine-model.md` and `GLOSSARY.md` summarize the accepted ones.

## What counts as a design decision

Anything the model (`docs/engine-model.md`, the ADRs and the glossary) doesn't already cover:

- a new type, field, GameEvent or GameAction, or anything stored in game state
- behaviour a player could notice, or an interpretation of the Magic rules
- a fallback for a case the model doesn't cover
- anything that contradicts or stretches the docs
- a new dependency or service

Not a design decision: private helpers, names, refactors that change none of the above.

## Ask before building

- **In a session with the user:** stop before writing the code and ask, with the options and a recommendation (a grilling round for several at once, one question for one). Don't decide and mention it afterwards.
- **Planning a stack of PRs:** list the decisions the work needs and settle them first. Record them in a docs-only PR at the bottom of the stack.
- **Without the user** (GitHub Action, background work): don't decide silently. Write the ADR with `Status: Proposed` and keep going. The `decisions` check blocks the merge until the user has weighed in.

## Record it

- One ADR per decision in `docs/adr/` (`NNNN-short-title.md`, next free number), in the same PR as the code. Update `docs/engine-model.md` and `GLOSSARY.md` if they describe the area.
- The third line is the status:
  - `Status: Proposed` until the user has answered.
  - `Status: Accepted (decided with Melissa, YYYY-MM-DD, <link to where she answered>)` only after her explicit answer in the session or in a PR comment. Never mark an ADR Accepted on your own judgment.
- An ADR that changes an earlier one says so, and the earlier one gets an "amended by" or "superseded by" note.

## On GitHub

- PRs touching `docs/adr/`, `docs/engine-model.md` or `GLOSSARY.md` get the `design-decision` label automatically.
- The required `decisions` check fails while any ADR in the PR is `Proposed`.
- Such a PR starts its description with a **Decisions** section: each decision in a sentence, its ADR, and where it was discussed.
- When the user comments `@claude grill me on the decisions in this PR`, ask about each Proposed ADR in the PR thread: numbered questions, a recommended answer for each, phrased so "yes" accepts it. Then update each ADR's status and the docs from her answers.
