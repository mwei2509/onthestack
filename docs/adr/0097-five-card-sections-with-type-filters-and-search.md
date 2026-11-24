# A Deck's cards fall into five sections, with type filters and a search

Status: Accepted (decided with Melissa, 2026-11-24, in the session building the canvas's Deck viewer)

Amends ADR 0084.

Both views of the Deck page group cards as the canvas does:

1. **Commander:** the cards marked as commander.
2. **Creatures:** any other card that's a creature.
3. **Other permanents:** artifacts, enchantments, planeswalkers and battles that aren't creatures.
4. **Spells:** instants and sorceries.
5. **Lands:** lands that aren't creatures, artifact lands included.

Each section shows how many cards it holds, counting quantities. A double-faced card still goes by its front face. A card with several types is a Creature if it's a creature, otherwise a Land if it's a land, so an artifact creature and Dryad Arbor are Creatures and an artifact land is a Land.

Above the cards, chips filter by type (All, Creatures, Spells, Lands, Other; Creatures includes the commander when it's a creature), and a search box matches card names and Oracle text, ignoring case. Filter and search apply to both views.

## Consequences

- The server still works out each card's section from the card store's `type_line`, so the web app needs no Magic knowledge of its own.
- The groups' names change in the Deck API, so the Deck page and its tests change with them.

## Considered options

- **ADR 0084's nine groups, with a search:** finer, but nine groups of a 100-card Deck leave several with one or two cards, and the chips would be too many for a phone.
- **No search:** saves sending Oracle text, but "which of my cards make Treasure?" is a question players ask of their own Deck.
