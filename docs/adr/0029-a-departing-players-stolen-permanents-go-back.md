# A departing player's stolen permanents go back first

Status: Accepted (decided with Melissa, 2026-11-21, in the design session on the XMage research). Supersedes the "player who leaves" bullet of ADR 0028.

When a player leaves the game (CR 800.4a), everything they own leaves the game, and any effect giving them control of something ends, so a creature they had stolen returns to the player it was taken from. Only then is anything they still control exiled. ADR 0028 skipped the middle step and exiled stolen permanents; XMage's `PlayerLeftGameRangeAllTest` covers the case (`docs/research/xmage-engine.md`).
