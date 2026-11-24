# The commander is picked from the Deck's own cards, legendary ones first

Status: Accepted (decided with Melissa, 2026-11-24, in the build session for #72)

Refines ADR 0077, which has the player mark a Deck's commander but doesn't say how. A Deck with no commander shows "No commander" with the lines that need a look. "Choose" opens the Deck's cards with a search box. Legendary creatures and legendary planeswalkers are listed first and everything else after them, each part alphabetically. Tapping a card marks it, and a second tap on another marks partners. The same picker is in the Deck's ⋯ menu, to change a commander later.

Listing legendary creatures and planeswalkers first doesn't decide anything. Every card stays selectable, because some cards say they can be your commander.

## Consequences

- A Deck pasted without a Commander heading takes a tap or two to finish, without leaving the page.

## Considered options

- **Every card A–Z with no grouping:** simpler, but the likely choices are buried in a 100-card list.
