# Battlefield screens show each player's cards like a playmat

Status: Accepted (decided with Melissa, 2026-11-24, in the session planning #170)

Accepts decisions 21–27 of the "Battlefield — cards on the table" row on the design canvas, without one detail. Amends ADR 0059: a player's battlefield gets a screen of its own instead of a panel in the seat detail view.

- **Layout:** each player's battlefield is drawn like a playmat seen from their seat. Creatures go in front, then planeswalkers, artifacts and enchantments, then lands and tokens nearest the player.
- **Tapped and identical cards:** tapped cards turn sideways. Identical permanents stack into one fan with a count ("Goblin ×7 · 3 tapped"), split into an untapped fan and a tapped fan.
- **The card face** is our own frame: the name, a colour-identity glow where art would go, and power/toughness or loyalty in a corner. It never copies Magic's frame or mana symbols. Power/toughness is the engine's result. Tapping a card opens a sheet with its rules text and facts, including the printed value when it differs ("2/2 now · printed 1/1").
- **Graveyard and exile** are face-up spreads, newest first.
- **Hands and libraries are never shown.** The screens never advise.
- **Every phone can look at every player's field.** Your own is the default, and seat coins switch between players. A player who is out shows "Fallen".

The canvas also shows the turn each card reached the graveyard and what exiled it. The engine keeps graveyard and exile as plain lists of cards, so that line is left out for now. It could later be worked out from the sealed turns' GameEvents.
