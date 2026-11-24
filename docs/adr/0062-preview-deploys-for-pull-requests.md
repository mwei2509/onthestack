# Pull requests get Cloudflare Preview deploys

Status: Accepted (decided with Melissa, 2026-11-23, in a Claude Code session)

Every pull request from a branch in this repo gets its own Cloudflare Preview (`wrangler preview --name pr-<number>`), created or updated on each push. A bot comment on the PR links it, and the Preview is deleted when the PR closes. Pull requests from forks get none, since GitHub withholds repository secrets from them.

Previews serve HTTPS on `workers.dev`, so a voice change can be tried on a real phone before it merges (browsers only allow the microphone over HTTPS). Each Preview gets its own Durable Object namespace and storage, so games on a Preview never touch production games. Previews are on Cloudflare's free plan (100 per Worker, the least recently deployed deleted first) and their requests count against the same free daily quota as production.

## Consequences

- Preview URLs are public and guessable from the PR number. Nothing secret lives in a game.
- Previews share any D1 database or R2 bucket bound by the same ID. When D1 and R2 arrive (ADR 0044), the `previews` block in `wrangler.jsonc` should bind separate ones or decide to share.
- Previews are an open-beta Cloudflare feature. If it breaks, the preview job can be dropped without touching production deploys.

## Considered options

- **Version URLs (`wrangler versions upload`):** Cloudflare doesn't generate them for Workers that implement a Durable Object.
- **A separate Worker per PR (a Wrangler environment):** works, but each needs its own deploy and cleanup and counts toward the account's Worker limit.
- **No previews:** simpler, but voice changes could only be tried on a phone after merging or over a local tunnel.
