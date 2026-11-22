# LLM card Translation instead of Forge's card scripts

Status: Accepted (decided with Melissa, 2026-11-21).

No card API describes what triggered abilities do in machine-readable form. Forge's card scripts do, for about 99.9% of Commander-legal cards, but they are GPL-3.0 and the maintainers have declined to relicense them, so using them would make this project GPL. We keep the project MIT and instead have an LLM produce each card's Translation from its Oracle text once, validated against our schema and stored per card for every game and group.

Anything the schema can't express, or the model flags as uncertain, is Unmodeled. The deck owner can review Translations at import, every Staged trigger shows the card's Oracle text beside the app's reading, a correction at the table fixes the stored Translation for everyone, and evals over tricky cards run in CI.

## Considered options

- **Forge (GPL-3.0):** best data, but forces the project's license.
- **XMage (MIT):** cards are Java code; extraction would need a Java parser and complex cards wouldn't come out cleanly.
- **Hand-tagging:** accurate but doesn't scale beyond a few decks.
