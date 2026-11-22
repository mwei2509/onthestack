# Smaller engine decisions from the first build

Status: Accepted (decided with Melissa, 2026-11-21, in the design session reviewing the engine PRs).

- **The draw is a Step reminder, not a PlayerTask.** PlayerTasks are for physical actions cards cause; the draw step's on-screen prompt covers the routine draw.
- **An unknown card is never guessed.** A card not in the game's card list goes on the Stack with a RulesWarning; when it resolves, the app doesn't decide where it went and asks for a BoardCorrection.
- **A player who leaves the game** takes what they own out of the game, and what they controlled but didn't own is exiled (CR 800.4a).
- **A loop guard** stops settling after 100 passes with a RulesWarning to check the board.
- **Lifelink and deathtouch apply to all damage**, not only combat damage, as the rules say.
- **Commander damage** is counted when a commander's combat damage hits a player.
- **An intervening-if that fails on resolution** marks the Stack item `conditionNotMet` and does nothing (Felidar Sovereign below 40 life when its trigger resolves, CR 603.4).
