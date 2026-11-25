# PlayerTasks show on their player's phone, and Done is kept across re-reads

Status: Accepted (decided with Melissa, 2026-11-24, in the session planning #50)

A PlayerTask ("Blood Artist: choose a player to lose 1 life, and say who") shows as a card on its player's phone, with Done. Everyone else sees it as a line in This turn's log, and on the Shared screen when there is one. When the Step changes with a task still undone, the Step chip pulses gently. Tasks never block play.

A task's id changes on every replay, so Done is kept the way "Do it anyway" is (ADR 0123). The Game keeps the turn's done tasks, and a task matches one with the same player, text and causing statements. If what caused the task changes, it comes back. Marking a task done is recorded as a `PlayerTaskDone` TableEvent naming who.

Showing every task on every phone was rejected as too noisy. Showing tasks only in the log was rejected because the player who owes the task could miss it. Matching on player and text alone was rejected because one tap would mark two identical tasks done, such as two Blood Artist triggers.
