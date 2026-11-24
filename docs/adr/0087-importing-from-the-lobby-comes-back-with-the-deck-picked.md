# Importing a Deck from the lobby comes back to the game with it picked

Status: Accepted (decided with Melissa, 2026-11-24, in the build session for #72)

The join screen's "+ Import a deck instead" opens the Decks import page in the same tab. After the import, the player comes straight back to the game with the new Deck picked in the join form, ready for "Take a seat". Changing a seat's Deck in the lobby offers the same link.

## Consequences

- A player with no Deck in the library can join a game without a detour through the library and back to the game link.
- The game link carries the Deck back (`/g/<code>?deck=<id>`). The join form reads it once and the server still checks the Deck exists when the seat is taken.

## Considered options

- **Open the library:** no round trip to build, but the player has to find their way back to the game.
