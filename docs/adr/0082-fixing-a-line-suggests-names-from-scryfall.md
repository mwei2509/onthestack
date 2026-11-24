# Fixing an unmatched line suggests card names from Scryfall

Status: Accepted (decided with Melissa, 2026-11-24, in the build session for #72)

Refines ADR 0077. On a Deck's page, fixing a line a player meant as a card (`1 Goldspan Dragn`) asks "Which card is it?" and suggests card names as they type, following the Claude Design canvas. The suggestions come from Scryfall's card-name autocomplete through a small Worker route, `GET /api/cards/autocomplete?q=`, because the card store only holds cards that were imported. Picking a suggestion fixes the line with that exact name and the line's quantity, then matches it through the card store like any other fix.

## Consequences

- A fix can always reach the right card, even one nobody has imported yet, and a picked name always matches.
- The browser waits for a pause in typing before asking, and the route asks only for two letters or more, so a fix costs a handful of requests, within Scryfall's guidelines. Answers are cached for a day.
- A line that couldn't be read at all can still be retyped in full.

## Considered options

- **Retype the line, no suggestions:** no new route, but a misspelling can take several tries.
