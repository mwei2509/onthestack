# A trigger's Oracle reminders ride on its Stack item's readback note

Status: Accepted (decided with Melissa, 2026-11-28, in the session building #52)

When a triggered ability goes on the Stack, the Oracle reminders in its effects (ADR 0131) are copied onto the Stack item as `reminders`. They travel in its AbilityTriggered GameEvent, so the readback note for that resolved Stack item (ADR 0134) can show them from GameEvents alone (ADR 0135): "Coastal Piracy (Theo): Whenever a creature you control deals combat damage to an opponent, you may draw a card." Nobody marks a reminder done, unlike a PlayerTask.

Always-on statics show their reminders on the event they apply to instead (ADR 0139).

## Considered options

- **A PlayerTask per reminder:** reuses what exists, but every reminder would sit on a phone until someone taps Done, and the glossary keeps the two apart.
- **A new `OracleReminder` GameEvent at resolution:** explicit in the history, but a new event type for something the Stack item already knows.
