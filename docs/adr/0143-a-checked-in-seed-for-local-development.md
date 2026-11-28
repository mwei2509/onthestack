# A checked-in seed for local development

Status: Accepted (decided with Melissa, 2026-11-28, in the session building #173)

Each checkout keeps its own local D1, Durable Objects and R2 in `packages/server/.wrangler/state`, so a new worktree starts with no Decks and no games. The repo carries a seed, `packages/server/seed/local.json`, that every checkout loads:

- The seed holds every local Deck with its versions, only the cards and printings they use, and each chosen game's Durable Object storage, key by key. Card images aren't seeded; they fill from Scryfall on first use (ADR 0044, 0071).
- The Worker reads and loads it through `/api/dev/seed` (`GET ?games=A,B` reads; `POST` loads), served only when `LOCAL_DEV` is set, so it works through the app's own code rather than wrangler's file layout. Loading replaces rows with the same keys and each named game's storage.
- `stx wt create` seeds the new worktree right away: its `pnpm install` runs `packages/server`'s `postinstall`, which loads the seed when that checkout's local database has no Decks, and never in CI. `stx seed save` and `stx seed load` capture and reset it by hand. All of it lives in this repo, not in the personal CLI.

Copying `.wrangler/state` into worktrees was rejected: it's binary, ties the seed to wrangler's internals, and copies whatever else the main clone holds. Exporting with `wrangler d1 export` plus the Durable Object's SQLite files was rejected for the same reason. When a migration or a stored shape breaks the seed, it's saved again.
