# Paying life for a land that asks for none warns and costs nothing

Status: Accepted (decided with Melissa, 2026-11-28, in the session building #52)

A `playLand` that says its controller paid life (ADR 0133) for a land whose Translation asks for no payment ("Forest, pay 2") raises a `nothingToPay` RulesWarning ("Forest doesn't ask for life to enter untapped.") and takes no life. It is probably a misreading or a mix-up at the table, so the app flags it rather than recording a loss nobody owed (principle 3). A player who really lost the life can say so or correct their total.

## Considered options

- **Ignore it silently:** less noise, but something a player said would vanish without a trace.
- **Take the life anyway:** trusts the statement, but it's most likely a misread.
