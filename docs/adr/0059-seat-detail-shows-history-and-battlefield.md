# A seat's detail view shows its history and its battlefield

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

Tapping a seat, on a phone or a Shared screen, opens what the app thinks that player's state is and why, so players can check the app against their cards and their memory:

- **History:** every change to life and to commander damage, with its cause and turn ("−3 Goblin Guide (Theo), turn 4"; "+1 Authority of the Consuls, turn 5"). Every GameEvent already records its cause, so this is display only.
- **Battlefield:** a read-only picture of the player's permanents, with counters. Power and toughness show the engine's result beside the printed value. Tapping a card corrects it, as a BoardCorrection (ADR 0056).
- Hidden zones (hand, library) aren't shown.

Cards are text tiles for now; card images come from the card store (ADR 0044).

## Consequences

- Corrections are made where players can see what they're correcting, and every one is kept in the history.
- Built with RulesWarnings on screen and BoardCorrections (#50, #51), after the lobby and the board.
