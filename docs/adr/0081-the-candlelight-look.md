# The Candlelight look, with seats coloured by their commander's colour identity

Status: Accepted (decided with Melissa, 2026-11-24, in the session following #42)

The web app moves from the first screens' look (ink grey, one amber accent, Space Grotesk numbers) to the "Candlelight" direction on the Claude Design canvas: a plum table-felt background, gold for whose turn it is and the main buttons, names and numbers in Cinzel, life inside a crest, and − / + as coins. Only the active turn glows; nothing else moves.

Each seat is identified by its commander's colour identity: a coin ringed in its colours, a painted glow behind the seat, and gem pips. The gems are original diamond shapes, not the mana symbols. Every coin carries the player's initial, so colour is never the only cue.

A seat that has no colour identity, because it has no Deck yet or its Deck has no commander marked (ADR 0080), uses its seat colour instead: the same per-seat colour the first screens used, for its coin and glow, with no gem pips. Players and the commander damage they dealt stay easy to tell apart.

## Consequences

- Two players with the same colour identity (two five-colour Decks) look alike apart from their initials and names.
- Colour identity has to reach the screens: the game's copy of each Deck (ADR 0050) needs its commanders' colour identity, which comes with the Deck library (#72).
- Cinzel is loaded from Google Fonts alongside Inter, as the first screens' fonts were. No new dependency.

## Considered options

- **Neutral gold for seats without a colour identity:** closer to the Candlelight note, but before Decks every seat looks the same apart from its initial.
- **Kitchen table:** the brighter, sillier direction on the canvas (Fredoka, sticker outlines, sunny yellow).
