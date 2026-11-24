# Deleting an account keeps its public Decks and past games readable

Status: Accepted (decided with Melissa, 2026-11-24, in the session that specified accounts)

Anyone can delete their account from the account page, after a confirm. Deleting removes the account, its email, its passkeys and its sessions. Its public Decks stay in the library with no owner, open to everyone like the Decks imported before accounts (ADR 0093). Its private Decks are deleted. Seats it held become Guest seats under the same name, so past games still read correctly.

## Consequences

- Nothing that identifies the person by account is kept, beyond the names they played under in games.
- Other players don't lose public Decks they've played with.

## Considered options

- **Delete their public Decks too:** cleaner for the person, but other players lose Decks they use.
- **No deletion in the first version:** less to build, but accounts would hold emails with no way to remove them.
