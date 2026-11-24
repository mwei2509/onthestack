# Production deploys from GitHub Actions on every merge to main

Status: Accepted (decided with Melissa, 2026-11-23, in a Claude Code session)

The Worker, with the web app and the Game Durable Object (ADR 0008), deploys to production from a `deploy` job in `.github/workflows/ci.yml`. The job runs on pushes to `main` only, after build, typecheck, lint and tests pass, and runs `wrangler deploy`. It authenticates with two repository secrets: `CLOUDFLARE_DEPLOY_TOKEN`, a token scoped to deploying Workers and editing onthestack.gg's DNS, and `CLOUDFLARE_ACCOUNT_ID`. It is kept separate from `CLOUDFLARE_API_TOKEN`, the Workers AI token the eval workflow uses, so the eval job can't change production. Deploys run one at a time, so two quick merges can't race.

The repo is public, so GitHub Actions minutes are free. The deploy stays in the repo next to CI, gated on the same checks, and is visible in the PR's history.

## Consequences

- `main` is always what's live. A merge that breaks the deploy turns `main` red and leaves the previous version serving.
- The Cloudflare account, the API token and the repository secrets are one-time manual steps for the maintainer, documented in `docs/deploy.md`. Until the secrets exist, the deploy job fails on `main`.
- Rolling back is `wrangler rollback` or reverting the merge.

## Considered options

- **Cloudflare Workers Builds (git integration in the dashboard):** free and needs no secrets in GitHub, but its build configuration lives in the dashboard and it deploys without waiting for our CI.
- **Deploy by hand at first:** no secrets to set up, but every merge needs a manual step and what's live can drift from `main`.
