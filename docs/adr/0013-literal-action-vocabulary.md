# Speech and cards translate into a small set of literal Actions

The engine understands only literal board operations: cast, play a land, move a card between zones, tap or untap, change control (with an optional "until"), counters, power/toughness modifiers, life, damage, attack and block. Nothing in the engine knows what a particular card does.

Everything else is translated into those Actions. The voice parser turns speech into them. Card Translations (milestone 3) turn a card's text into them with blanks to fill; until then, players say the effect ("I take Theo's Heliod until end of turn"). A Command with a blank becomes a Question to the speaker ("which creature?"), and that player's next Hold-to-talk answers it ("Heliod").

This keeps the rules engine small and testable, keeps card knowledge in one replaceable layer, and means a card the app doesn't understand never blocks play: the player states its literal effect.

## Consequences

- Effects the engine doesn't model as rules are still expressible: replacement effects such as token and counter doublers are recorded with the quantity the player states, with a Warning when a known doubler is in play.
- Commanders go to the command zone by default when they would go to a graveyard or exile; a player can say otherwise.
