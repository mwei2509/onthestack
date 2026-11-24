# Sessions are renewed at most once a day and cleaned up when found

Status: Accepted (decided with Melissa, 2026-11-24, in the session that started #107)

Builds on ADR 0090.

- **Renewed at most once a day.** "Renewed on use" pushes a session's expiry out only when it was last renewed more than a day ago, so ordinary use doesn't write to D1 on every request. A session therefore ends between 29 and 30 days after it was last used.
- **Expired rows are deleted when found.** An expired session or challenge is deleted when a request comes across it, and signing in also deletes the account's other expired sessions. There is no scheduled cleanup job.

## Consequences

- An account that never signs in again leaves its expired session rows in D1 until it does, or until the account is deleted. They are a hash and two dates each.

## Considered options

- **Renewing on every request:** an exact 30 days, for a D1 write on nearly every request.
- **A Cron Trigger that clears expired rows:** free and tidy, but another moving part to deploy and watch.
