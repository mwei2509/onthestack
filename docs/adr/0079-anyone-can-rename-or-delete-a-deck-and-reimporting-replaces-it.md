# Anyone can rename or delete a Deck, and re-importing replaces it

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #72)

Amended by ADR 0093 (only the owner changes an owned Deck).

Refines ADR 0048 and ADR 0050. With one shared library and no accounts, anyone can rename a Deck or delete it, after a confirm step. Deleting a Deck never changes a game that already started, because a game copies its Decks at Start (ADR 0050).

Re-importing an Archidekt link replaces everything on the Deck it made with what Archidekt has now: name, cards, commander and unmatched lines. Archidekt is the source of truth for a Deck imported from it, so fixes, skips, a marked commander and a new name made in the app since the last import are lost.

## Consequences

- Anyone can remove anyone's Deck. That's acceptable while the app serves one playgroup (ADR 0048); accounts bring owners.
- To keep a change across re-imports, make it on Archidekt.

## Considered options

- **Keep a name changed in the app across re-imports:** friendlier, but the Deck would then differ from Archidekt in a way that's easy to forget.
- **No delete:** nobody can remove a Deck by accident, but mistakes and old Decks pile up in a shared library.
