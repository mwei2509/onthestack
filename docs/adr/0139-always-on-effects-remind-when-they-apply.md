# Always-on effects show their Oracle reminder when they apply

Status: Accepted (decided with Melissa, 2026-11-28, in the session that opened #184)

Amends ADR 0131. A continuous or replacement static ("If you would gain life, you gain that much plus 1", Cleric Class) still isn't applied by the engine (M3, ADR 0031). It becomes a static ability with an Oracle reminder and a `when`, using the same event conditions as a trigger's `when` (for Cleric Class, its controller gaining life). While the permanent is in the ability's `zone`, each GameEvent that matches adds a readback note (ADR 0135) carrying the card and its Oracle sentence, next to the event it applies to. The engine changes no number on its own: players say what happened ("I gain 3 instead") and the interpreter records it (principle 2).

A static the drafting tool can't give a `when` (an anthem, "creatures you control have flying") stays an Oracle reminder with no `when`, and nothing shows during play until M3.

## Why

Before this, Oracle reminders showed only when an ability resolved. A static never resolves, so the table got no reminder at the moment the effect mattered, which was what players asked to come first.

## Considered options

- **A standing list of each seat's always-on effects:** simpler, but it isn't tied to the moment the effect matters, so it's easy to miss.
- **Leaving statics to M3 (ADR 0131 unchanged):** no reminders for some of the most common Commander cards until the layer work.
