# Translations are drafted by Claude Haiku in the interpreter package, scored by an eval set

Status: Accepted (decided with Melissa, 2026-11-25, in the session starting #52)

- **Where:** a `translate` module in `packages/interpreter`. It turns a card's Oracle text into a Translation, reusing the interpreter's LLM providers and the same "non-strict tool plus Zod and one retry" approach (ADR 0046). The schema is validated in code; an answer that doesn't validate, or that the model marks unsure, comes out `unmodeled`.
- **Model:** Claude Haiku 5.5 by default, on the key the interpreter already uses (ADR 0047). Gemini Flash-Lite is scored in the same evals for comparison. The prompt is cached, and each eval run reports the tokens it used, so the cost of drafting a whole card pool (ADR 0030's estimate of about 6M tokens for 3,000 cards) can be checked before it is done.
- **Drafting tool:** a dev command that drafts one or more cards' Translations from their Oracle text and prints them validated. Drafting cards for real games, and storing the results, is #53.
- **Eval set:** about 50 cards, each Oracle text paired with an expected Translation. It mixes cards from the test Decks already in the library with top Commander cards that cover each tricky shape: shock, check, pain and fast lands, "you may", once each turn, intervening-if, "enters or attacks", targets, counted amounts, and cards that must come out `unmodeled` or as Oracle reminders. Expected Translations are written by hand and reviewed in the PR. The runner reports a pass rate per provider.
- **XMage check (ADR 0030) comes later**, in #182. Building XMage and dumping its abilities isn't needed to score drafts; the eval set does that until then.

## Considered options

- **Gemini Flash-Lite as the drafter:** free, but it guessed where Haiku asked in the interpreter evals (ADR 0047), and guessing is what `unmodeled` exists to prevent.
- **A separate package:** keeps card drafting apart from the conversation interpreter, but duplicates the provider adapters.
- **Eval cards from the top Commander cards only, or from Melissa's Decks only:** the first doesn't reflect the cards played here; the second covers fewer shapes.
