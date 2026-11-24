# A seat keeps a summary of its Deck until Start

Status: Accepted (decided with Melissa, 2026-11-24, in the build session for #72)

Refines ADR 0054 and ADR 0080. When a seat picks a Deck, in joining or editing the seat, the game stores a summary of it on the seat: the Deck's id, name, commanders and colour identity. The lobby shows each seat's Deck from that summary, so lobby updates never wait on D1. At Start the game still reads each Deck afresh and copies it whole (ADR 0050).

## Consequences

- A Deck renamed, re-imported or given a commander while a lobby is open shows its old summary in that lobby until the seat picks it again. Start uses the Deck as it is then.
- A Deck deleted while a lobby is open is found missing at Start, and Start is refused with a message naming the seat, so the player can pick another.

## Considered options

- **Look every seat's Deck up on each lobby update:** always current, but a D1 query per seat on every change in the lobby.
