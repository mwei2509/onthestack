# Decks have owners and are public or private

Status: Accepted (decided with Melissa, 2026-11-24, in the session that specified accounts)

Amends ADR 0048 and ADR 0079. A Deck imported by a signed-in player belongs to them. An owned Deck is either **public** (in the shared library, anyone can pick it for a game) or **private** (only its owner sees it and picks it). New Decks are public, as the library is today. "Friends only" waits for a friends feature.

Only the owner can rename, fix, re-import, mark the commander, change the visibility of or delete an owned Deck. Decks with no owner, imported before accounts or by Guests, keep ADR 0079's rule that anyone can change them, and a signed-in player can claim one to own it.

## Consequences

- The library's list shows public Decks plus your own private ones.
- Importing an Archidekt link that someone else's Deck came from makes your own copy, owned by you (or unowned, for a Guest), instead of changing theirs. Re-importing that link later updates your copy. Each Archidekt deck can have one Deck per owner, plus at most one unowned, which refines ADR 0050's "updates that Deck".
- A game copies its Decks at Start (ADR 0050), so making a Deck private or deleting it never changes a game in progress.

## Considered options

- **An "unlisted" visibility (anyone with the link):** not needed yet.
- **Freeze unowned Decks:** protects them, but nobody could fix the Decks imported before accounts.
- **Anyone can still edit everything:** ownership would mean nothing.
