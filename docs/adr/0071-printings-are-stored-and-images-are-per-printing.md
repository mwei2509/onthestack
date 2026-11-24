# Printings are stored, and each Deck shows its own printing's art

Status: Accepted (decided with Melissa, 2026-11-23, in a Claude Code session)

Amends ADR 0044, which stores card images in R2 without saying which printing they show. A Deck can name a specific printing: an Archidekt import gives each card's Scryfall ID, and an Archidekt text export gives set code and collector number (ADR 0049). Players should see the art on the physical card in front of them, so images are per printing, not per card.

A D1 `printings` table maps each printing we have seen to its card: `scryfall_id` (primary key), `oracle_id`, `set_code`, `collector_number` (indexed together), and whether it has a back face image. An import resolves a Scryfall ID or a set and collector number from this table first, and only asks Scryfall's `/cards/collection` for the ones it doesn't know. A line that names only a card (`1 Sol Ring`) gets Scryfall's newest printing, which is what the collection endpoint returns for a name.

Images are served from `/api/images/<scryfall id>` and, for a double-faced card, `/api/images/<scryfall id>/back`. They're Scryfall's `grid` image, a 488×680 WebP (the replacement for its `normal` JPG): large enough for a phone, about a third of the size of the PNG. A miss fetches the image from Scryfall once and stores it in R2 under the same path, unaltered (artist and copyright line intact, as Scryfall's image guidelines require). Responses are cached by browsers as immutable, since a printing's image doesn't change.

## Consequences

- Two Decks with the same card in different printings show different art, and share one `cards` row and its Translation.
- R2 holds one image per printing used, plus a back image for double-faced cards: well under a gigabyte for a playgroup.
- The image route is under `/api/` so the Worker runs before static assets (`run_worker_first` in `wrangler.jsonc`).

## Considered options

- **One image per Oracle card:** no printings table, but every set and collector number lookup asks Scryfall, and the art often won't match the physical card.
- **Scryfall's PNG or `large` image:** sharper, but two to three times the bytes on a phone for no visible gain at table size.
