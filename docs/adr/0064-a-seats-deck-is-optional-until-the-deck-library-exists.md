# A seat's Deck is optional until the Deck library exists

Status: Accepted (decided with Melissa, 2026-11-23, in the build session for #42).

Amended by ADR 0080 (a seat needs a Deck now that the library exists).

Amends ADR 0051. #42 (the lobby and the live board) is built before the Deck library (#72) and the card store (#22), so there are no saved Decks to pick yet. Until there are, a device joins with a name and, optionally, a Deck. The server reads Decks through a small interface, so the Deck picker appears in the lobby once #72 provides saved Decks, with no change to the lobby itself.

A seat without a Deck has no commander: the command zone is empty, and no commander damage can be dealt by that seat's commander. Everything else works the same: life, Steps and turns.

## Consequences

- The board can be tried at a real table before Decks can be imported.
- When #72 lands, the lobby offers the Deck picker. Whether a Deck then becomes required is decided then.
