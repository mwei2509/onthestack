# Simultaneous zone changes are one GameEvent

Status: Accepted (decided with Melissa, 2026-11-21, in the design session reviewing the engine PRs).

Everything that leaves the battlefield at the same moment (creatures dying to the same state-based check, a board wipe) is recorded as one `ZoneChanged` GameEvent carrying every object, each with its card. "Leaves the battlefield" triggers look back at the board as it was just before that event (CR 603.10), so Blood Artist dying alongside three other creatures sees all four deaths, its own included. Recording them one at a time, as the first engine version did, missed deaths processed after Blood Artist's own.
