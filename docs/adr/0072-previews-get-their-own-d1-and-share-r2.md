# Previews get their own D1 database and share the R2 image bucket

Status: Accepted (decided with Melissa, 2026-11-23, in a Claude Code session)

Settles what ADR 0062 left open. All Previews bind one `onthestack-preview` D1 database, separate from production's. D1 holds the card store now and the Deck library (#72) next, so a Preview's test Decks, and any migration a pull request adds, never reach production. The preview job applies pending migrations to the preview database before each Preview, as the deploy job does for production.

Previews bind the same R2 bucket as production. It only holds unaltered Scryfall images keyed by printing (ADR 0071), which are the same whoever fetched them, so sharing it is safe and spares Previews re-fetching every image.

## Consequences

- Previews share one database, so two open pull requests with conflicting migrations can break each other's Previews. That's acceptable for a project with one or two open PRs at a time. Recreating the preview database clears it.
- A Preview can write images into the production bucket. Images are only ever fetched from Scryfall by printing ID, so a Preview can't store anything production wouldn't.
- Each binding is listed twice in `wrangler.jsonc`, once for production and once in `previews`, because Previews don't inherit production bindings.

## Considered options

- **Separate D1 and R2 for Previews:** fully isolated, but every Preview re-fills images from Scryfall.
- **Share both with production:** nothing to set up, but test Decks and unmerged migrations would land in production.
