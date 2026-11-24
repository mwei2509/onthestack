# The account page

Status: Accepted (decided with Melissa, 2026-11-24, in the session that started #107)

Builds on ADR 0088, 0089 and 0094.

- **One `/account` page.** Home has a "Sign in" link at the top, which shows the display name once signed in. Signed out, `/account` offers "Sign in" and "Create account"; signed in, it is the account page. Joining as a Guest doesn't change.
- **Display names follow the seat-name rule.** The display name fills the name field when joining (ADR 0088), so it is trimmed, can't be empty, and has a seat name's maximum length. The email is only checked loosely (something@something), since it isn't verified (ADR 0089).
- **Passkeys are told apart by where they were made.** Each passkey gets a label from the browser and device that made it ("Safari on iPhone"), and the page shows when it was added and last used. They can't be renamed yet. The last passkey can't be removed (ADR 0088).
- **Deleting asks once, in the app.** "Delete account" opens a dialog that says what happens (ADR 0094): passkeys, email and sessions go, private Decks go, public Decks stay without an owner, and seats become Guest seats under the same name. A red "Delete my account" button confirms; nothing has to be typed.

## Considered options

- **A separate sign-in page and account page:** two routes for one thing a player looks for.
- **Naming passkeys by hand:** clearer for someone with many, more to build; a later addition.
- **Typing "delete" to confirm:** guards a rare action that a dialog already guards.
