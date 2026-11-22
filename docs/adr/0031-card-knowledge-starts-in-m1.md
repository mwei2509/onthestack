# Card knowledge starts in milestone 1

Status: Accepted (decided with Melissa, 2026-11-21, in the design session on the XMage research).

Melissa wants the app to know what cards do rather than relying on players to state every effect (ADR 0024). So card knowledge moves into M1, in its smallest credible form:

- **Recognise every triggered ability:** when it fires, its conditions and its targets, modelled fully.
- **Apply five common effects:** gain or lose life, damage to each opponent, counters on itself, creating tokens, and pumping itself.
- **Everything else is a reminder** showing the card's Oracle text at the moment it applies, and the interpreter fills in what players say happened.

Anthems, doublers and other continuous or replacement effects stay in M3, because they need the layer and replacement work. This needs only the existing GameEvents, plus matching "deals combat damage to a player".
