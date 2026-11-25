# How a Scryfall card becomes a game's card

Status: Accepted (decided with Melissa, 2026-11-24, in the session that planned #45)

The game's cards (ADR 0119) turn each stored Scryfall card into the engine's card definition with a pure function (ADR 0070).

- **What the engine gets:** name, types and subtypes, legendary, power and toughness, keywords, mana value, cost, colour identity, and each face of a double-faced card. Oracle text, the type line and the Deck's printing (for images, ADR 0071) stay beside the engine's list, outside its state, so they aren't copied on every engine step. Colours and loyalty are left out until something reads them.
- **Keywords** come from Scryfall's list, but a keyword counts only when it also stands on a line of its own in the Oracle text ("Flying", "Flying, vigilance"). Scryfall also lists keywords a card only grants to others, such as Akroma's Memorial's Flying, and those don't make the card itself fly. Every keyword that passes is kept, modelled by the engine or not, so screens can show Ward or Hexproof.
- **Power or toughness printed as `*`** (Tarmogoyf, `1+*`) is marked as varying, never read as 0. Such a creature doesn't die from toughness 0 and deals no automatic combat damage; a RulesWarning asks the table for the number. Never guess.
- **Double-faced, split and adventure cards** are keyed by their full Scryfall name ("Front // Back"), which is how Decks and the command zone already name them. Each face's name, types and power/toughness are kept; types and power/toughness come from the front face, as the Deck viewer shows them (ADR 0084). Saying either face's name finds the card, and a land on either face counts as playing a land.
- **Each player's colour identity** comes from their Deck and is given to the engine with their seat, so partner commanders count (ADR 0083, 0110).
- **A card in no Deck in the game** still raises `unknownCard` (ADR 0028). The game doesn't fetch it from the card store mid-game; tokens keep working as they do.

**The board view** gives each permanent its types, so screens can tell creatures from lands. Rules text, printed power/toughness and images are fetched separately, once per game, by the screens that need them.

## Considered options

- **Trust Scryfall's keyword list:** gives cards keywords they only grant.
- **Read `*` as 0:** the creature would die as soon as it entered.
- **Key double-faced cards by their front face, or one entry per face:** neither matches how Decks and the command zone name them.
