# Decks live in one shared library until accounts arrive

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

Amends ADR 0002, which tied saving Decks to accounts. Players import their Decks before any test game, so Decks are saved from the first build, without accounts, in one library that everyone using the app can see and pick from. This matches the glossary's Deck: it exists on its own, independent of any player, so it can be shared and reused.

This is a first phase. Once accounts exist, a Deck gets an owner and a visibility: private, friends only or public. Nothing in the first build stores an owner or a visibility, because there is nothing to fill them with yet.

## Consequences

- Anyone with the app can see, re-import or use any saved Deck. That's acceptable while the app serves one playgroup.
- Moving to owned Decks needs a migration that assigns existing Decks to someone, or leaves them public.
