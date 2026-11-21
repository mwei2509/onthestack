# Code comments

Applies to all source, config, scripts, and workflow files. Same principle as [docs-vs-code.md](docs-vs-code.md): only write what has durable value and can't be derived elsewhere.

## Allowed

A comment must explain something a competent reader would not understand from the code itself:

- Unusual or unexpected behavior, and why it's needed (workarounds for library or platform quirks, ordering that matters, deliberate deviations from the obvious approach).
- Constraints the code can't enforce (e.g. "must use `import * as` for the deployment dependency analyzer", "must stay deterministic: event-log replay depends on it").
- Justification on tool directives (`eslint-disable`, `@ts-expect-error`): say why the suppression is needed.

## Not allowed

- History: what changed, what it used to be, who changed it, when, or why it was refactored. That belongs in commit messages and PRs.
- Ticket or task tracking: TODOs, plans, ticket links as narrative. Track work in the project management tool.
- Restating the code: comments that describe what the next line obviously does, or that repeat names and types.
- Commented-out code. Delete it; version control keeps it.

## Applying it

- When writing code, add no comment unless it meets the bar above. Put context for reviewers in the commit message or PR description instead.
- When editing code that has a comment that is now wrong, or that is history or restatement, fix or remove it as part of the change. Don't sweep unrelated files for comment cleanup unless asked.
