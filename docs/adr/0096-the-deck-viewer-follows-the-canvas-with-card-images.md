# The Deck viewer follows the canvas, with real card images

Status: Accepted (decided with Melissa, 2026-11-24, in the session building the canvas's Deck viewer)

Amends ADR 0099.

The Deck page's Cards view becomes the Deck viewer drawn on the Claude Design canvas (boards "Deck viewer · phone", "· a card opened big" and "· laptop / shared screen"), keeping ADR 0099's real card images where the canvas draws its own frame:

- **The grid** shows each card's image with the canvas's ×N badge on stacked copies (basics and duplicates are one tile) and the commander ringed in gold. If an image can't load, the tile shows the card's name, cost and type line instead.
- **Opening a card** shows it large, its Oracle text, its mana value and "In this deck ×N", with previous and next buttons that step through the cards in order. Double-faced cards keep Flip. On a phone it covers the page and closes with ×. On a wide screen it sits in a panel to the right of the grid, showing the first card until another is picked.
- **Cards is the default view.** The List view stays one tap away (the switch from ADR 0099), and each device still remembers its choice.
- **Facts only** (canvas decision 19): no ratings, prices, suggested swaps or combos. The viewer never advises (principle 4).

Renaming, deleting, choosing the commander and fixing lines stay as ADRs 0077, 0079 and 0083 have them.

## Consequences

- The Deck API sends each card's Oracle text, mana value, mana cost and type line. A double-faced card's text is both faces', front first; its cost and type line are its front face's.

## Considered options

- **The canvas's drawn frame everywhere:** name, cost gems and a colour glow where art goes. The canvas itself expected real images to replace the glow, and they exist already.
- **Drawn frame in the grid, image when opened:** easier to read small on a phone, but players recognise their cards by art.
- **Dropping the List view:** search would cover finding a card by name, but scanning names is quicker in a list.
