# Phone-first, with an optional Shared screen, in v1

Status: Accepted (decided with Melissa, 2026-11-21).

Amended by ADR 0048: Decks are saved without accounts, in one shared library, until accounts arrive. Amended by ADR 0088 (optional accounts, signed in with passkeys).

The proposal planned one shared device for the MVP and multi-device sync in Phase 4. We make each player's Phone the primary device from v1: it is their microphone, shows their own life, counters and commander damage, and receives the Questions and Tasks that affect them ("Did Theo pay 2?", "You gain 1 life"). A Shared screen in the middle is optional and shows the whole game; Phones have a board view as a fallback so a game works without one.

Routing Questions and Tasks to the affected player, and a close microphone for each speaker, outweighed the cost of real-time sync arriving early. Players join by QR or room code; accounts are only needed to save Decks, and Guests can play.
