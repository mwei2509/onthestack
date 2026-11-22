# Menace is a reminder while blocking, a RulesWarning at damage

Status: Accepted (decided with Melissa, 2026-11-21, in the design session reviewing the engine PRs).

When an attacker with menace has a single blocker, the board shows a reminder on it ("menace: needs another blocker") from that block until a second blocker arrives, not a RulesWarning: another block may be coming. If combat damage begins with menace still blocked by one creature, it becomes a RulesWarning offering "Go back" (reopen blocks through a take-back) or "Do it anyway". Reminders like this are computed in the TableView, never stored, and never block play.
