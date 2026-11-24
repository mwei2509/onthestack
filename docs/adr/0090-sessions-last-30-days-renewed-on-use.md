# Signing in lasts 30 days, renewed on use

Status: Accepted (decided with Melissa, 2026-11-24, in the session that specified accounts)

Signing in gives the browser a session: a random token in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie, stored in D1 only as a hash. A session expires 30 days after it was last used, and using the app pushes that out again, so a regular player rarely sees the passkey prompt. The account page has "Sign out" and "Sign out everywhere", which ends every session of the account.

## Consequences

- A lost or shared device stays signed in for at most 30 days of not being used, or until "Sign out everywhere".
- The game's WebSocket learns who is connected from the same cookie, so seats can follow accounts (ADR 0091).

## Considered options

- **Sessions that never expire:** fewer prompts, but a lost device stays signed in for good.
- **7 days:** safer, but players who skip a week sign in again every time.
