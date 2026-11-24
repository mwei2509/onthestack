# A Deck's cards can be seen as images

Status: Accepted (decided with Melissa, 2026-11-24, in the session following #72)

The Deck page (ADR 0084) lists its cards by name in type groups. It gains a second view, **Cards**: the same groups in the same order, each card shown as its image (ADR 0071) in a grid, with a quantity badge on cards with more than one copy and a gold ring on the commander. A List / Cards switch sits beside the Cards heading, and each device remembers which view it used last.

Tapping a card, in either view, opens it large in a sheet with its quantity. A double-faced card has a Flip button that shows its back image.

## Consequences

- The Deck API marks double-faced cards (`doubleFaced` on each card), read from whether its printing has a back image (ADR 0073).
- Images load as they scroll into view, so a new Deck's first look fills its images from Scryfall gradually rather than all at once. After that they come from R2.
- An image that can't load shows the card's name in its place.

## Considered options

- **Cards grid only:** most visual, but finding one card by name means scanning images.
- **List only, tap for the image:** lightest on data, but no way to look over the whole Deck.
