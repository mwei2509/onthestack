# A seat needs a Deck, and Start checks nothing else about it

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #72)

Amends ADR 0051 and ADR 0064. Now that the Deck library exists, joining a game asks for a name and a Deck from the library, and the lobby links to the library to import one. A seat can't be added without a Deck, and a seat can change its Deck in the lobby.

Start doesn't check the Decks themselves: a Deck with unmatched lines, or with no commander marked, can still be played. A seat whose Deck has no commander has an empty command zone, as ADR 0064 describes for a seat without a Deck.

## Consequences

- A game can no longer start with nobody's Deck imported, so a quick life-only game needs Decks imported first.
- Commander damage from a seat whose Deck has no commander can't be tracked until the players fix the Deck. The game keeps the copy it took at Start, so a fix only applies to the next game (ADR 0050).

## Considered options

- **The Deck stays optional:** quick games still work, but a game could start with nothing to track commanders by.
- **Start waits for every Deck to have a commander:** stricter, but one player's Deck export can hold up the whole table.
