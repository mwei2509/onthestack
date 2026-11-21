# Cloudflare Workers and Durable Objects for the backend

The server (ADR 0003) runs on Cloudflare: one Durable Object per game holds the authoritative engine, the WebSockets to every Phone and Shared screen, and the game's snapshots in its SQLite storage. Workers serve the web app as static assets and host the parsing and deck-import endpoints. D1 holds data that outlives a game (Decks, shared card Translations, and accounts when they arrive).

A Durable Object is a natural fit for "one stateful authority per game", and one group's usage sits well inside the free plan (about 100k requests/day; exceeding a limit fails requests rather than billing). Keeping speech-to-text and possibly the LLM on Workers AI means one provider and one account.

## Considered options

- **Supabase:** quotas fit, but Edge Functions are stateless so there is no home for a live game instance, and free projects pause after a week without activity, which is the gap between weekly games.
- **PartyKit:** its hosted platform shut down in October 2026; its successor library runs on Durable Objects anyway.
