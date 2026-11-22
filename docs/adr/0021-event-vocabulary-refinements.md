# Cleanup lists what ended; damage splits and land drops are explicit

Status: Accepted (decided with Melissa, 2026-11-21, in the design session on E2). Amended by ADR 0036 (`how` uses Arena's zone-transfer categories; `play` becomes `playLand`).

Three refinements to the GameEvent vocabulary:

- **Cleanup stays one simultaneous GameEvent** (CR 514.2), so a +0/+3 wearing off can't kill anything, but `CleanedUp` lists what changed: the "until end of turn" effects that ended, the damage removed, and the creatures returned to their owners. Nothing ends unseen.
- **`DamageAssignmentSet` is a recorded player choice** (CR 510.1c–d): what a player said about dividing a blocked attacker's damage. Other engines get it through a prompt and an answer; for us it comes from the conversation.
- **Land drops are tagged:** `ZoneChanged { how: 'play' }` marks a land played from hand, so the board can show a "second land this turn" reminder.
