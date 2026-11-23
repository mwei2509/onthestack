# Deploying

`main` deploys to https://onthestack.gg from the `deploy` job in `.github/workflows/ci.yml`, after CI passes (ADR 0061). The hostnames are set in `packages/server/wrangler.jsonc` (ADR 0063). Everything here runs on Cloudflare's and GitHub's free plans.

## One-time setup (maintainer)

Do these before the first deploy. Until the secrets exist, the `deploy` job fails on `main`.

1. **Move the domain's DNS to Cloudflare.** In the Cloudflare dashboard, add `onthestack.gg` on the Free plan. At Namecheap (Domain List → Manage → Nameservers → Custom DNS), enter the two nameservers Cloudflare gives, then wait for Cloudflare to show the domain as Active.
2. **Delete the imported parking records.** Cloudflare copies Namecheap's DNS records. Delete the apex `A` record and the `www` record: a Worker Custom Domain can't be created over an existing record.
3. **Pick a `workers.dev` subdomain** (Workers & Pages → Overview). Preview URLs live there (ADR 0062).
4. **Create an API token** (My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template). Scope it to your account and the `onthestack.gg` zone, and add **Zone → DNS → Edit** for that zone, which Wrangler needs to create the Custom Domain's record.
5. **Add the repository secrets:**
   ```sh
   gh secret set CLOUDFLARE_DEPLOY_TOKEN   # the token from step 4
   gh secret set CLOUDFLARE_ACCOUNT_ID     # Workers & Pages → Overview, right-hand side
   ```
6. **Redirect `www`.** Add a DNS record `www`, type `AAAA`, content `100::`, Proxied. Then Rules → Redirect Rules → create from the "Redirect from WWW to root" template (301, keep the path and query string).

## Deploying

- Every push to `main` deploys once CI passes.
- To redeploy `main` without a new commit: Actions → CI → Run workflow.
- To roll back: `pnpm --filter @onthestack/server exec wrangler rollback` (after `wrangler login`), or revert the merge.

## Pull request Previews

Each pull request from a branch in this repo gets a Cloudflare Preview named `pr-<number>` from `.github/workflows/preview.yml` (ADR 0062). A comment on the PR links it, and it is updated on every push and deleted when the PR closes. A Preview has its own Durable Objects, so its games are separate from production. Forks and a repo without the secrets above get no Preview, and the job passes. To delete one by hand: `pnpm --filter @onthestack/server exec wrangler preview delete --name pr-<number>`.

## Checking a deploy

```sh
curl https://onthestack.gg/api/health          # {"ok":true}
curl -sI https://www.onthestack.gg | grep -i location   # https://onthestack.gg/
```

The web app has no game-socket UI yet. To check that a socket connects over mobile data, join a laptop to the phone's hotspot (with Wi-Fi off on the phone) and run:

```sh
npx wscat -c wss://onthestack.gg/api/games/smoke-test/ws   # < {"type":"state","state":null}
```
