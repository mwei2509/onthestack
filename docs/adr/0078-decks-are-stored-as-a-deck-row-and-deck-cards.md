# Decks are stored as a row per Deck and a row per card, pointing at the card store

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #72)

A D1 `decks` table holds one row per Deck: its id, name, `archidekt_id` (unique, so re-importing a link finds the Deck it made, ADR 0050), its unmatched lines as JSON, and when it was created and last imported. A `deck_cards` table holds one row per card on the Deck: `deck_id`, `oracle_id` (a foreign key to `cards`), `scryfall_id` (a foreign key to `printings`: the printing this Deck shows, ADR 0071), `quantity`, and whether it is a commander.

Foreign keys mean a Deck can never point at a card the card store doesn't hold. An import writes all of a Deck's cards in one statement, the same set-based way the card store writes, so a 100-card Deck stays well inside D1's free limit of 50 queries per request. Reading a Deck is one join.

## Consequences

- "Which Decks run this card?" is a plain query, should anything need it.
- A card can't be deleted from the card store while a Deck uses it. Nothing deletes cards.
- Unmatched lines are JSON on the Deck because, by definition, they point at no card.
- The library's search by name or commander filters the list in the browser. One playgroup's library is small enough to send whole.

## Considered options

- **The Deck's cards as a JSON column:** one row per Deck, but nothing stops a Deck pointing at a card that isn't stored.
