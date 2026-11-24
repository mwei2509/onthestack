# Stated taps are recorded, mana included

Status: Accepted (decided with Melissa, 2026-11-24, after "i play godless shrine and tap it" lost its tap)

When a player says they tapped a permanent, the interpreter records a tap entry for it, including a land tapped for mana ("I play Godless Shrine and tap it" is a land drop, then a tap). The board then shows it tapped until the untap step.

Nothing is inferred: casting a spell doesn't tap any lands unless someone says so. This applies "only record what players said they did" to taps, which the prompt didn't spell out, so Haiku recorded them only sometimes.

## Consequences

- The system prompt says so, and an eval case covers it (`land-and-tap-with-seat-ids`).

## Considered options

- **Ignoring taps for mana:** less on screen, but the board's tapped lands wouldn't match the table.
