# Quick − / + taps combine into one life change

Status: Accepted (decided with Melissa, 2026-11-23, in the build session for #42).

Refines ADR 0056. A player tapping − three times for a Lightning Bolt lost 3 life at once, not 1 life three times, and the rules care: "whenever you lose life" triggers once for a single loss of 3. So the phone gathers taps on − and + and sends them as one `life` GameAction once the player has paused for about 1.5 seconds, showing the pending change (−3) on the life total meanwhile. A net change of 0 sends nothing.

## Consequences

- Other screens see a life change about 1.5 seconds after the last tap.
- Two separate losses tapped in quick succession are recorded as one. Once voice arrives, saying them is the precise way, and a BoardCorrection fixes a count.
