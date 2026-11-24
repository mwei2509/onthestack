# Each card says whether the app knows how it works

Status: Accepted (decided with Melissa, 2026-11-24, in the session building the canvas's Deck viewer)

A card opened in the Deck viewer (ADR 0096) carries one of two labels (canvas decision 18):

- **"The app knows how this card works"**, in green, when the card has a Translation the app can use.
- **"Not taught yet — the app will ask you when it matters"**, in orange, otherwise.

It's shown from now on, although no card has a Translation until card knowledge reaches games (#52, #53), so every card says "Not taught yet" for now. That is the truth today, and it tells players what to expect at the table: the app asks rather than guesses (principle 2).

## Consequences

- The Deck API marks each card `known`. It's false for every card until Translations exist; then it's true for a card with one.

## Considered options

- **Wait for #53:** no label until some card can be known. Hides the label's meaning until it differs between cards.
