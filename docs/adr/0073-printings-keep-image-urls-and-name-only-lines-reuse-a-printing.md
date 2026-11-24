# Printings keep their image URLs, and name-only lines reuse a stored printing

Status: Accepted (decided with Melissa, 2026-11-23, in a Claude Code session)

Refines ADR 0071 with two details found while building the card store against Scryfall's real responses.

**Printings store their image URLs.** Instead of a flag for whether a printing has a back image, the `printings` table keeps the URL of the printing's `grid` front image and, for a double-faced card, its back image (`back_image_url` is empty otherwise). Scryfall puts a double-faced card's images on each face and a single-faced card's on the card itself, so the URLs are read at import, when we have the card object anyway. Filling an image from the image route then only touches Scryfall's image host. Without the URLs, each miss would cost a call to Scryfall's rate-limited API, and a new 100-card Deck sends 100 image requests at once.

**A name-only line reuses a stored printing.** ADR 0071 gives a line that names only a card (`1 Sol Ring`) Scryfall's newest printing. When that card is already stored, the import uses a printing we already have for it instead, so it needs no Scryfall request. Scryfall's newest printing is used only when nothing is stored for the card.

## Consequences

- Which art a name-only line shows depends on which printings earlier imports stored. It's always a real printing of the right card.
- If Scryfall changes an image (a better scan), the stored URL may point at an older version until the card is re-fetched (#82).
