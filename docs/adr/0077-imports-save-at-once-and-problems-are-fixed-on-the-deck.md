# An import saves the Deck at once, and its problems are fixed on the Deck

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #72)

Amended by ADR 0082 (fixing a line suggests names from Scryfall) and ADR 0083 (how the commander is picked).

Refines ADR 0049. Importing a Deck saves it straight away with every card that matched. Nothing waits on a review step, so a Deck is never half imported.

- **Unmatched lines** (a line that can't be read, or that names a card or printing the card store can't find) are kept on the Deck, in the order they appeared. On the Deck's page each one can be edited and matched again, or skipped, which drops it.
- **A missing commander** (a pasted list with no `Commander` heading or `[Commander]` category) is listed alongside the unmatched lines. On the Deck's page the player marks one of the Deck's cards as its commander, or two for partners. The app never picks one (principle 2).
- **A pasted Deck's name** comes from a name field on the paste form, filled with the commander's name once the list is read, and the player can change it. An Archidekt import takes the Deck's name on Archidekt.

## Consequences

- A Deck in the library can be incomplete or have no commander. The glossary already allows a Deck to be incomplete, and ADR 0080 lets either be used in a game.
- Fixing a line goes through the card store like an import, so a fixed line can fetch from Scryfall.

## Considered options

- **Review before saving:** every bad line fixed or skipped before the Deck exists. Nothing incomplete reaches the library, but an import can't be finished later.
- **Refuse a list with no commander:** simpler, but a list exported without categories could never be imported as it is.
