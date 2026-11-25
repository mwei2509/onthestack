# A game references its Decks' versions instead of copying them

Status: Accepted (decided with Melissa, 2026-11-24, in the session that planned #45)

Amends ADR 0050. A Deck's cards are now kept in **versions**. Re-importing it, fixing a line so it joins the cards, or changing its commander makes a new version. Renaming it or skipping an unmatched line doesn't, because neither changes its cards. The Deck points at its latest version.

At Start, a game records the Deck version each seat brought, not a copy of its cards. When the game's Durable Object wakes up, it loads those versions' cards from D1 in one query and keeps them in memory for the engine and the interpreter. So editing or re-importing a Deck still never changes a game in progress or its history (ADR 0050's promise), without the game holding a copy.

- **Card data can still change under a game.** The card store keeps one row per card (ADR 0070). If a Scryfall refresh updates a card's Oracle text, a running game sees the new text. Those updates are rare and are corrections; versioning every card row would cost far more than it gives.
- **Versions a game uses are never deleted.** Deleting a Deck removes it from the library, but any version a game refers to stays, hidden. The same holds for the private Decks deleted with an account (ADR 0094). Old versions are otherwise kept too: each is about a hundred small rows.
- **If D1 can't be reached when a game wakes,** the game runs without card data, as games did before, until the next load succeeds.
- **Games started before this** stay without card data. They behave as they always did.

## Consequences

- Saved turns, sealed turns and debug reports don't carry the Decks' cards, so they stay small however long the game runs.
- The Deck store gains a versions table; each existing Deck becomes its own version 1.
- The field screens and the interpreter read the same rows the game does.

## Considered options

- **Copy the cards into the game at Start (ADR 0050):** self-contained, but a few hundred cards copied into every saved and sealed turn, which pushes debug reports past their size limit after about fifteen turns.
- **Read the Deck's current cards at load:** no versions needed, but an edited Deck would change games already under way.
- **Version card rows too:** shields games from Scryfall corrections nobody would want to be shielded from.
