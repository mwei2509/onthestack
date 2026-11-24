# Re-importing updates a Deck, and a game copies its Decks at Start

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

Amended by ADR 0079 (re-importing replaces everything, name included). Amended by ADR 0093 (re-importing updates your own Deck or an unowned one).

Decks change between games. Importing an Archidekt link that was imported before updates that Deck instead of making a second one. A pasted list always makes a new Deck, because nothing identifies it as an earlier one.

When a game starts, it copies each seat's Deck, with its card data, into the game. Editing or re-importing a Deck afterwards never changes a game in progress or its history.

## Consequences

- Each game is self-contained: its board, replays and sealed turns don't depend on a Deck that may have changed since.
- A game holds a copy of up to six Decks' card data, a few hundred cards at most, in its Durable Object storage.
