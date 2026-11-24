# A Deck's cards are listed in type groups that open to show the cards

Status: Accepted (decided with Melissa, 2026-11-24, in the build session for #72)

The Deck page lists its cards in groups by type, as the Claude Design canvas draws them: Creatures, Planeswalkers, Battles, Instants, Sorceries, Artifacts, Enchantments, Lands, plus Other for anything else. Each group shows how many cards it holds, counting quantities, and opens to list its cards with their quantities and the commander marked.

A card with more than one type goes in the first group of that order that fits, so an artifact creature is a Creature and a dryad arbor is a Creature. A double-faced card goes by its front face.

## Consequences

- Each card's type and whether it's legendary come from the card store's `type_line`, read by the server, so the web app needs no Magic knowledge of its own.
- Card images aren't on the Deck page yet. They're served already (ADR 0071) and can be added later.
