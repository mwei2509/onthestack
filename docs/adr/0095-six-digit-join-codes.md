# Six-digit join codes, retired when a game ends or goes idle

Status: Accepted (decided with Melissa, 2026-11-24, in the session following #72)

Amends ADR 0052. Home gets a **Join game** button where a player types a short code, so nobody has to open a link or type `KITE-MOSS-42` on a phone.

- **Six digits**, like `482 913`: a million codes, so trying random ones almost never lands in a live game. Shown in two halves to read aloud.
- **Beside the game's code, not instead of it.** The game keeps its `KITE-MOSS-42` code for its link and its history, so links and past games (ADR 0092) keep working after the join code is gone. The join code is only for typing into Join game. The lobby shows it large, with the link.
- **Retired** when the game ends (ADR 0092), or after 24 hours with no activity, so abandoned games don't hold codes forever. A retired code can be given to a new game. A game whose code was retired is still reachable by its link.
- **Guessing is slowed down:** code lookups are rate-limited per address (about ten a minute) with Cloudflare's rate limiting binding, which is free. A person typing never notices; a script can't sweep the codes.

A join code is as trusted as the game's link: anyone with it can join or take a seat (ADR 0052, 0053).

## Consequences

- Join codes live in D1, which is shared by every game, so a code can be checked as free and handed out atomically. The Game Durable Object keeps its own code and refreshes its last-activity time in D1 as play goes on.
- Until ending a game exists (ADR 0092, built with accounts), only the 24-hour rule retires codes. Ending a game will retire its code when it's built.

## Considered options

- **Four or five digits:** easier to type, but with a few dozen live games random guessing finds one quickly.
- **Replacing the link code:** once a code is reused, old links would open someone else's game.
- **Retiring the code at Start:** nobody new joins after Start (ADR 0051), but a phone that died mid-game couldn't rejoin by code.
- **No rate limit:** simpler, but anyone could script through every code.
