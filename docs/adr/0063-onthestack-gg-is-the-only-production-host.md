# onthestack.gg is the only production hostname

Status: Accepted (decided with Melissa, 2026-11-23, in a Claude Code session)

The app is served at the apex `onthestack.gg`, a Worker Custom Domain, which Cloudflare gives a certificate automatically. `www.onthestack.gg` permanently redirects to it with a Cloudflare Redirect Rule. The Worker's production `workers.dev` URL is turned off (`workers_dev: false`), so there is one address to share at the table. `workers.dev` stays on for Preview URLs only (ADR 0062).

## Consequences

- A Worker Custom Domain needs the domain's DNS on Cloudflare. The domain is registered at Namecheap, so its nameservers move to Cloudflare (free plan). This, and the `www` record and redirect rule, are manual steps in `docs/deploy.md`.
- The redirect is configured in the dashboard, not in code: with static assets served before the Worker, a code redirect would need every request to run the Worker.

## Considered options

- **Apex only:** one fewer DNS record, but people typing `www.` get nothing.
- **Leave production on `workers.dev` as well:** costs nothing, but gives games two addresses.
