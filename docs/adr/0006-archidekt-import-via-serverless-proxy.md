# Archidekt import through a serverless proxy

Archidekt has no official API. Its deck endpoint (`/api/decks/<id>/`) returns everything we need, including Scryfall oracle IDs, but only allows browser requests from archidekt.com, and its terms forbid automated requests. A forum reply from an Archidekt user (not confirmed staff) says rate limiting starts around 40 requests per minute and that staying under it is fine. We fetch a pasted deck link from a small serverless function, one request per user-initiated import, well under that limit, and keep pasted export text as a fallback for any deck site.

If Archidekt objects or the endpoint changes, pasted text remains the supported path.
