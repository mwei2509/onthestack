# A card outside its player's commander colours raises a RulesWarning

Status: Accepted (decided with Melissa, 2026-11-24, in the session looking into a missing RulesWarning)

When a player casts a spell or plays a land whose colour identity isn't within their commander's colour identity, the engine raises a RulesWarning, for example "Goblin Shrine is red; your commander is white and black." As with every RulesWarning, players can do it anyway (principle 3).

It's checked alongside ADR 0028's `unknownCard`, which flags a card in no seat's Deck. A card can raise both.

A player with no commander gets no colour warning. With partners, the identity is both commanders' together (ADR 0081).

## Consequences

- Built with #45, which fills the engine's card list from the seats' Decks, since the engine needs each card's colour identity. In the same work, a land the engine doesn't know gets `unknownCard` too; today only spells do.
- Players see it once RulesWarnings are on screen (#50).

## Considered options

- **Only "not in any Deck":** a card in your Deck is legal at the table whatever its colour, leaving deck legality to the Deck page. Melissa chose to flag it at the table too.
