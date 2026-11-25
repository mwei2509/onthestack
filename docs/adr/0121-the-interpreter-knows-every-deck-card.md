# The interpreter knows every card in the game's Decks

Status: Accepted (decided with Melissa, 2026-11-24, in the session that planned #45)

Amends ADR 0015, which gave the interpreter Oracle text only for cards in play. With each interpretation it now gets **every card in every Deck in the game** in full: name, type line, power and toughness, keywords and Oracle text, each face of a double-faced card labelled. Basics and cards shared between Decks appear once, sorted by name. In a four-player Commander game that's about 300–350 cards, roughly 26–35 thousand tokens.

The list never changes during a game, so it's one block, cached: the fixed system prompt, then the game's cards, then the board and the turn's statements. It's built from the Decks' versions (ADR 0119), not from the engine's list, so a token made mid-game doesn't break the cache. It uses the five-minute cache. Haiku 5.5's prices put a cache hit at a tenth of the input price, so a game of about 300 interpretations costs roughly $0.10–0.15 in card text.

- Each interpretation's record logs a fingerprint of the card block, not its text: the last ten records are kept and go into reports (ADR 0117).
- The interpreter records how many tokens came from the cache, so we can see caching working.
- A card name in a cast or a land play is matched to the game's exact name, ignoring case and punctuation and accepting either face's name. A name that matches nothing still raises `unknownCard`.

This is measured with the interpreter evals before it's called done. If latency or accuracy suffers, the fallback is a smaller block: every card's name, plus full text for the battlefield and the active player's Deck.

## Considered options

- **Oracle text for cards in play only (ADR 0015):** the interpreter can't tell what an opponent's instant does, or recognise a card it has never seen named.
- **Every name, plus full text for the battlefield and the active player's Deck:** about half the tokens, but the active player's part changes every turn and must be cached again, so it costs about the same, and opponents' instants, commanders and graveyards show by name only.
