# One device per seat

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

Amended by ADR 0091 (a signed-in player's seat follows their account).

A seat is connected to at most one device. Each browser remembers its seat for a game in localStorage, and on reload it reconnects and takes that seat again without asking. There's no token or secret: anyone with the game's code is trusted.

A device without a remembered seat, such as a new phone or a private window, sees the seats with a "That's me" button on each. On a seat that's still connected, "That's me" asks for confirmation, then moves the seat to the new device, and the old one returns to choosing. "Just watching" connects without a seat, which is how a Shared screen joins.

One device per seat keeps it clear whose microphone speaks for a seat once Hold-to-talk arrives.

## Consequences

- A phone that dies mid-game is replaced by tapping "That's me" on another device.
- Two people can't both act as the same seat from different phones.
