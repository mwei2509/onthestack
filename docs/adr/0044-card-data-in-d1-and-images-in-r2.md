# Cards are fetched from Scryfall at Deck import, stored in D1, with images in R2

Status: Accepted (decided with Melissa, 2026-11-22, in a Claude Code session)

Amended by ADR 0070 (what a row holds) and ADR 0071 (printings, and images per printing).

The app looks up cards constantly (Translation, the TableView), and calling Scryfall's API for each lookup during a game is slow and leans on someone else's service. We keep our own copy, but only of cards players actually use. Card data lives in a D1 `cards` table with one row per card, keyed by Scryfall Oracle ID, which is also what Archidekt returns for an imported Deck (ADR 0006) and the natural key for storing each card's Translation (ADR 0005). Card images live in an R2 bucket, and the app only ever points at our own URL.

A card is fetched when a Deck containing it is imported. The import checks which of the Deck's Oracle IDs are already in `cards`, and requests the rest from Scryfall's `POST /cards/collection` endpoint (up to 75 cards per request, so a Commander Deck is at most two requests), keeping only the fields the app uses. Pasted-text imports look cards up by name through the same endpoint. Lines Scryfall can't match (a typo, a card too new for Scryfall) are listed back to the player at import to fix or skip. Nothing is stored for them, and nothing is guessed.

Images are filled at the same time. After an import, the client requests each new card's image from our image route. On a miss, the route fetches the image from Scryfall once, stores it in R2 and returns it, so the TableView never waits on Scryfall mid-game. The same route covers any card that comes up without being on a Deck.

Stored cards are not refreshed on a schedule. Oracle text changes rarely, and players have the physical card in front of them. A manual `stx cards refresh` re-fetches stored cards and writes only rows that changed, and a single card can be re-fetched when players notice it is out of date.

## Consequences

- No bulk download, import script or seeded SQL. A fresh checkout's local D1 starts empty and fills as Decks are imported in dev, which calls Scryfall for those cards. Tests seed a small fixture of cards instead.
- Images are filled one request per card from the client, not in one Worker invocation, because the Workers free plan allows 50 outbound requests per invocation and a Commander Deck has 100 cards.
- A card that isn't on any imported Deck (a token, something an opponent stole) is missing from `cards` until it is fetched. Whatever needs its Oracle text fetches it on demand by the same path.
- We stay well inside Scryfall's request guidelines: a couple of requests per import, plus one image fetch per card the first time anyone imports it.
- Enabling R2 may require a payment method on the Cloudflare account even on the free plan. Images are Wizards' copyright under its Fan Content Policy. We serve them unaltered (artist and copyright line intact) and follow Scryfall's image guidelines.

## Considered options

- **Load every card from Scryfall's daily `oracle_cards` bulk file:** lookups never miss, but it means a local import script, a free-tier D1 write quota to manage, and seeding every worktree, all to store about 30,000 cards when a playgroup uses a few hundred.
- **Scryfall API per lookup:** no storage to manage, but a network round trip and a rate-limited dependency on every lookup mid-game.
- **Monthly scheduled refresh (Cron Trigger):** catches errata automatically, but it is extra machinery for changes that are rare and that players will notice at the table anyway.
- **Refresh a card when it is re-imported and its row is old:** no scheduler, but import gets slower and less predictable for little benefit.
- **Images only on first view:** stores slightly fewer images, but the first game with a Deck would wait on Scryfall for every card shown.
- **Placeholder rows for unmatched cards:** the Deck would look complete, but it would hold a card the app knows nothing about, which goes against never guessing.
