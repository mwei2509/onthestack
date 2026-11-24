# Coins and glows follow each seat's Deck's colour identity, in the lobby and on the board

Status: Accepted (decided with Melissa, 2026-11-24, in the build session for #72)

Puts ADR 0081 into effect now that seats have Decks. Every seat's coin, glow and gem pips, in the lobby and on the board, use its Deck's colour identity: the lobby's from the seat's Deck summary (ADR 0085), the board's from the game's copy of the Deck (ADR 0050). A Deck with no commander has no colour identity, and its seat keeps its seat colour, as ADR 0081 describes.

## Consequences

- Seats reach the screens with a colour identity, and the board's coins change from seat colours to Deck colours at Start.
- Two seats with the same colour identity look alike apart from their initials and names (ADR 0081).
