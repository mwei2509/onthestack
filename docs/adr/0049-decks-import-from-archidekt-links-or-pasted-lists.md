# Decks import from an Archidekt link or a pasted list, and the commander comes from the Deck

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

A Deck is imported either from an Archidekt deck link, through the Worker proxy of ADR 0006, or from a pasted list. The parser accepts two shapes of pasted list:

- **Archidekt's text export:** `1x Vona, Butcher of Magan (lcc) 293 [Commander{top}]`. The set code and collector number pin the printing, the category in brackets names the commander, and the Maybeboard and Sideboard categories are left out.
- **The common one-card-per-line format** exported by Moxfield, MTGO and Arena: `1 Sol Ring`, with the commander under a `Commander` heading.

Double-faced cards keep both faces (`Brightclimb Pathway // Grimclimb Pathway`). Two commanders are read as partners. The commander is never typed separately: it comes from the Deck, so the lobby asks only for a name and a Deck.

Cards are looked up in the card store (ADR 0044) by Scryfall ID, by set and collector number, or by name, in that order of preference. A line that can't be read or matched is listed back to the player to fix or skip, and nothing is guessed (principle 2).

## Consequences

- An export from another site that uses neither shape fails visibly, line by line, instead of importing wrong cards.
- Test fixtures include a real Archidekt export (a 100-card Vona deck).
