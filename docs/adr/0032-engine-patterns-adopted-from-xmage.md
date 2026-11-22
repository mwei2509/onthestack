# Engine patterns adopted from XMage, as each is needed

Status: Accepted (decided with Melissa, 2026-11-21, in the design session on the XMage research).

Following ADR 0023, the engine adopts these proven patterns (details and verdicts in `docs/research/xmage-engine.md`), each when the work first needs it:

- **Every zone change creates a new object** (CR 400.7), including cards in graveyards and exile, so "that creature", auras and delayed triggers don't follow a flickered card. Last-known information keeps the characteristics a trigger needs.
- **Durations:** until end of turn, until end of combat, for as long as the source is on the battlefield, and until your next turn.
- **Continuous effects in layers 2 (control), 6 (abilities) and 7 (power and toughness) only**, ordered by timestamp, with no dependency system.
- **Replacement effects are applied while a GameAction turns into GameEvents**, recording only the outcome. When the order of several matters (Hardened Scales and Doubling Season), a number a player states is accepted if some ordering produces it; the app asks only if nothing was said and the outcomes differ.
- **"This turn" questions are queries over the turn's GameEvents**, collected in one module and checked against XMage's list of watchers, rather than separate tallies.
