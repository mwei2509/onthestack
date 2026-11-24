# How passkey sign-in works

Status: Accepted (decided with Melissa, 2026-11-24, in the session that started #107)

Builds on ADR 0088.

- **One button to sign in.** Passkeys are saved as discoverable credentials, so "Sign in" asks the device which passkey to use and nobody types an email first (emails aren't unique, ADR 0089). Face ID, a fingerprint or the screen lock is asked for when the device has one (`userVerification: preferred`), not required.
- **The challenge lives in D1 for 5 minutes.** Each passkey prompt checks a random one-time challenge. The server stores it in an `auth_challenges` row that expires after 5 minutes and is deleted once used, and gives the browser the row's id in a short-lived cookie. No signing secret is needed in production, Previews or local dev.
- **Only our sites can make passkeys.** The relying party comes from the request's `Origin`, and only three are accepted: `https://onthestack.gg`, `http://localhost` on any port, and any Preview under `https://*.onthestack.workers.dev`, whose relying-party ID is `onthestack.workers.dev` so one passkey covers every Preview. Any other origin is refused.
- **An account is made only once its passkey is saved.** Sign-up sends the display name and email with the new passkey; if the prompt is cancelled or fails, nothing is stored and the form stays filled in to try again.
- **Browsers that can't make passkeys are told so** instead of failing at the prompt: they can still join games as a Guest, or create the account on a phone and sign in on this device with the phone's QR code. A way in without passkeys waits for email sign-in links (#111).
- **Sign-in and sign-up are rate-limited** per address, about ten a minute, with a free `AUTH_LIMITER` rate limiting binding like `JOIN_LIMITER` (ADR 0095).

## Consequences

- Someone with no passkey provider can't have an account yet; they play as a Guest, which needs nothing (ADR 0052).
- A Preview's passkeys are shared by every Preview, and are separate from onthestack.gg's and localhost's.

## Considered options

- **Typing an email before the passkey prompt:** works with non-discoverable passkeys, but an email can belong to several accounts until it's verified.
- **Requiring Face ID or the screen lock:** stronger, but refuses security keys and devices without one.
- **The challenge in a signed cookie:** no table, but a secret to set and rotate in three places.
- **Trusting any host:** simpler, but lets a look-alike site that proxies to the Worker register passkeys for itself.
- **Accounts without a passkey:** with no password (ADR 0088) and no email links yet, there would be no way back in; that is a Guest.
