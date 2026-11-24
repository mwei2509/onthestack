# Emails are unverified for now, and only verified emails ever link accounts automatically

Status: Accepted (decided with Melissa, 2026-11-24, in the session that specified accounts)

The email given at sign-up (ADR 0088) isn't checked yet, because checking means sending email, a service for later. Until an email is verified, it isn't unique: two accounts can hold the same unverified address, so a typo or someone typing another person's email can't block the real owner from signing up. Once verification exists, a verified email is unique, and verifying one releases the same address from any account where it's still unverified.

When Google or Discord sign-in is added, signing in that way links to an existing account automatically only if the provider says the email is verified **and** it matches an account whose email we have verified. Otherwise it signs in to the account already linked to that Google or Discord login, or makes a new one, and the player can link it from their account page while signed in.

## Consequences

- Matching an unverified email would let someone who typed your address at sign-up receive your Google login. Requiring both sides to be verified closes that.
- A verified email will also give a recovery path for a lost passkey ("email me a sign-in link").
- Choosing the mail service for verification is a later decision.

## Considered options

- **Unique emails from the start:** catches duplicates early, but an unverified address could be squatted.
- **Auto-link on any email match:** convenient, and unsafe while emails are unverified.
