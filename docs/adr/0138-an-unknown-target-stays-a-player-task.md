# An unknown target stays a PlayerTask, not a question on a readback note

Status: Accepted (decided with Melissa, 2026-11-27, in the session grilling #173)

Supersedes ADR 0057's "when the app doesn't know a target, the note asks without blocking" for that case. ADR 0125 already handles it as a PlayerTask on that player's phone ("Blood Artist: choose a player to lose 1 life, and say who"), so readback notes only report what was applied and never ask.
