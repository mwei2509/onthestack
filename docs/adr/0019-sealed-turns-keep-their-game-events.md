# Sealed turns keep their GameEvents

Status: Accepted (decided with Melissa, 2026-11-21).

Amends ADR 0014. When a turn is Sealed, its GameEvents are kept in read-only history alongside its PlayerStatements, InterpretedTimeline and summary. Every GameEvent records its cause, so "why is Melissa at 41?" can be answered after the turn is over by following the chain (life gained, caused by Authority of the Consuls' trigger, triggered by Savannah Lions entering, cast by Elena). The cost is a few dozen small records per turn.
