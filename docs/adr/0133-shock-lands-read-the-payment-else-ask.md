# Shock lands: read the life payment, else ask

Status: Accepted (decided with Melissa, 2026-11-24, https://github.com/mwei2509/onthestack/issues/52#issuecomment-7144981382)

For a land whose Translation says "you may pay N life; if you don't, it enters tapped" (Godless Shrine and the other shock lands), after "i play godless shrine and tap it" was read with no life change:

- If the player says they paid ("pay 2", "shock it") or uses the land at once ("and tap it"), the life payment is recorded, with a readback note (ADR 0057) they can mark Not right.
- If nothing said settles it, that player is asked a yes/no PlayerQuestion: "Did you pay 2 life for Godless Shrine?"
- The engine never takes the life on its own guess (principle 2).

The Translation schema expresses the optional payment that replaces entering tapped (ADR 0131). The interpreter's side, with its eval cases ("play X and tap it", "play X, shock it", "play X" alone, which asks, and "play X tapped"), comes when games use Translations (#53).
