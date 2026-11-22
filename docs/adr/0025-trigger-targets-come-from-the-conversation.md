# Trigger targets come from the conversation; otherwise a PlayerQuestion

Status: Accepted (decided with Melissa, 2026-11-21, in the design session reviewing the engine PRs).

When a triggered ability needs a choice the engine can't make, such as Blood Artist's "target player", the interpreter fills it from what players said ("Theo, you're losing a life"); the open blank is included in its prompt. Only if the conversation doesn't settle it does it become a PlayerQuestion to the ability's controller, answered by their next Hold-to-talk. Until PlayerQuestions are built, the engine's fallback is a PlayerTask asking the controller to say who.
