# Card data in D1 from Scryfall bulk files, card images cached in R2

Status: Proposed

The app looks up cards constantly (Deck import, Translation, the TableView), and calling Scryfall's API for each lookup is slow and leans on someone else's service. We keep our own copy instead. Card data lives in a D1 `cards` table with one row per card, keyed by Scryfall Oracle ID, which is also what Archidekt returns for an imported Deck (ADR 0006) and the natural key for storing each card's Translation (ADR 0005). It is loaded from Scryfall's daily `oracle_cards` bulk file, keeping only the fields the app uses. Card images live in an R2 bucket and the app only ever points at our own URL: a Worker route returns the image from R2, and on a miss fetches it from Scryfall once, stores it and returns it, so we only hold images for cards that actually come up.

## Consequences

- The bulk file is too large to parse inside a Worker, so the import is a local script (an `stx` command) that downloads it, trims each card and writes in batches. Refreshes write only cards that changed, to stay under D1's free daily write quota.
- Each checkout keeps its own local D1 and Durable Object state, so branches can't disturb each other. To avoid re-importing per worktree, the import writes a ready-to-load SQL file to a cache outside the repo, and local dev loads it into any checkout whose `cards` table is empty. Seeding a checkout never calls Scryfall.
- Tests seed a small fixture of cards rather than the full set.
- Enabling R2 may require a payment method on the Cloudflare account even on the free plan. Images are Wizards' copyright under its Fan Content Policy; we serve them unaltered (artist and copyright line intact) and follow Scryfall's image guidelines.

## Considered options

- **Scryfall API per lookup:** no storage to manage, but a network round trip and a rate-limited dependency on every lookup.
- **One row per printing (`default_cards`):** gives every printing's art, but triples the rows and the initial load no longer fits a day's free writes. One image per card is enough for a table companion.
- **Mirroring every image up front:** about 3–4GB at normal size, mostly cards nobody plays. Caching on first request stores far less.
- **One local state folder shared by every checkout (`wrangler dev --persist-to`):** no seeding, but games and schema changes on one branch would show up on every other.
- **A separate cards database read remotely in dev (`"remote": true`):** no seeding, but dev needs the network and writes from dev would reach the real database.
