# Accounts are optional and sign in with passkeys

Status: Accepted (decided with Melissa, 2026-11-24, in the session that specified accounts)

Amends ADR 0002, which needed accounts only for saving Decks. Anyone can still play as a Guest: a game's code, a name and a Deck are all a seat needs (ADR 0052, ADR 0080). An account adds a list of your games, seats that follow you to any device, and Decks you own (ADR 0091, 0092, 0093).

Signing up asks for a display name and an email, then the phone or browser saves a passkey (WebAuthn): Face ID, a fingerprint or the device's screen lock. There's no password. The server keeps only each passkey's public key. The display name fills the name field when joining a game, and can still be changed for that game. The email is private, never shown to other players, and unverified for now (ADR 0089).

An account has a list of sign-in methods, not one. Each passkey is one method, so a second passkey (on a laptop, say) can be added from the account page, and losing one phone doesn't lock anyone out. Google or Discord sign-in can join the list later as another kind of method, without changing accounts.

## Consequences

- No outside service and nothing to pay for: passkeys are verified by our Worker, using the `@simplewebauthn/server` and `@simplewebauthn/browser` libraries. They're a new dependency, agreed in this session.
- A passkey works only on the site that made it. onthestack.gg, `localhost` and the Previews each need their own; one passkey covers every Preview, since they share `onthestack.workers.dev`.
- Someone whose only passkey isn't synced (no iCloud Keychain, Google Password Manager or similar) and who loses that device loses the account, until verified emails give a recovery path. The account page encourages a second passkey.
- Accounts, sign-in methods and sessions live in D1 (ADR 0008).

## Considered options

- **Discord or Google sign-in first:** familiar, and they handle recovery, but each needs an app registered with the provider, and their sign-in can't return to Preview addresses. It stays a later addition.
- **Email magic links:** needs a mail-sending service now.
- **Username and password:** passwords to store and reset, with no email to reset by.
- **Accounts required:** simpler, but every visitor to a game night would sign up first.
