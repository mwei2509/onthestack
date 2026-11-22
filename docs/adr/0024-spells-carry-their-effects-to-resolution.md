# Spells carry their effects to resolution

Status: Accepted (decided with Melissa, 2026-11-21, in the design session reviewing the engine PRs).

A spell's effect happens when it resolves, not when it's cast (CR 608), which is what lets a Response stop it. So a cast GameAction carries the spell's effects: `cast { card, targets, effects }`. Until the app knows what a card does, the interpreter attaches what the player said ("Murder on Serra Angel" carries "destroy Serra Angel"); once it knows, the card's Translation supplies them.

## Consequences

Melissa wants the app to know what cards do, rather than relying on players to state effects. When that card knowledge arrives (currently milestone 3) is an open roadmap question, informed by the XMage research.
