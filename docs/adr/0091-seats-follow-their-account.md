# A signed-in player's seat follows their account

Status: Accepted (decided with Melissa, 2026-11-24, in the session that specified accounts)

Amends ADR 0053, where only the browser remembered its seat. When a signed-in player takes a seat, the seat records their account. Any of their devices that opens the game is put back in that seat without "That's me", and the seat is theirs in every game list (ADR 0092). Anyone else at the table can still take the seat with "That's me" and a confirm, for instance to play for someone whose phone died, because everyone with the code is trusted like someone at the table (ADR 0052). The owner's next device takes it back.

A Guest who then signs up or signs in, in the same browser, brings along the seats that browser remembers: they're attached to the account and show up in its games.

## Consequences

- Moving from a laptop to a phone, or reloading on a new browser, no longer means rejoining or claiming.
- Seats taken by Guests behave exactly as before.

## Considered options

- **Only the owner can take a signed-in seat:** safer, but nobody could play for a player whose phone died.
- **Signing in starts fresh:** simpler, but a Guest's current game wouldn't follow them.
