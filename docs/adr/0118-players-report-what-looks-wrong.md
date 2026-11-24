# Players report what looks wrong, with the game attached

Status: Accepted (decided with Melissa, 2026-11-24, in the session planning debugging)

During the test phase (ADR 0116), every device's game menu (⋯) has "Something's wrong?". It opens a box where a player types what they expected, for example "I would have expected Hinterland Sanctifier to gain me life". Sending it saves a report with:

- what they wrote, the game's code, the turn and Step, and the seat that reported it (or the Shared screen)
- the game's debug dump at that moment (ADR 0117)

A report never reaches the interpreter or the turn's record; it's feedback about the app, not a statement.

Reports go in a new `reports` table in the D1 database. If a dump would exceed 1 MB, the oldest interpretations lose their prompts until it fits. Each report is also logged. `stx reports` lists them, from the local database or with `--remote` from production through `wrangler d1 execute`, so there's no endpoint for reading them.

## Consequences

- The maintainer can point an agent at a report and it debugs from the game as it was, not as it is later.
- Reports are kept until deleted.

## Considered options

- **Also filing a GitHub issue per report:** needs a GitHub token in the Worker and sends game text to GitHub. An issue can be filed after a report has been looked at.
- **Saying it as a statement:** most natural, but mixes feedback into the turn's reading.
- **Only behind `?debug`:** players at a game night are often the ones who notice.
- **Storing dumps in R2:** no size limit, but a new bucket to set up for little gain.
