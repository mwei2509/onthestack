# What gets a readback note: one note per cause

Status: Accepted (decided with Melissa, 2026-11-27, in the session grilling #173)

Amends ADR 0057, whose examples only covered triggers.

Everything the engine applies on its own that changes the board gets a readback note:

- combat damage, with lifelink, deathtouch and the deaths that follow
- deaths from state-based actions, including a player losing
- every Stack item that resolves: spells, activated abilities and triggers, with the counters, tokens and deaths they cause

What a PlayerStatement or a BoardCorrection does directly ("I'm at 35", "Ana takes 2", "Heliod has two counters") gets no note, since its own entry already says it. Anything the engine adds on top does: if "Ana takes 2" kills her creature, "Dies: Grizzly Bears" is a note under that entry. Turn structure (untap, the draw, cleanup removing damage, Step changes) gets no note: it happens every turn and would be noise.

One note per cause, carrying everything that follows from it: one per combat damage step and one per resolved Stack item. A combat note has a line per attacker, with deaths at the end:

> Elenda dealt 1 to tester · lifelink: melissa gains 1
> Grizzly Bears dealt 2 to Ana
> Dies: Llanowar Elves

A Stack item's note reads like ADR 0057's: "Blood Artist (Priya): Ana loses 1, Priya gains 1."

Notes only for triggers was rejected: routine combat changed life totals with no reason on screen (game DELTA-TOWER-48, #173), and a wrong Translation on a spell would only show as an unexplained total. One note per GameEvent was rejected because a board wipe floods the screen. A single totals line for combat ("tester −1, Ana −2, melissa +1") was rejected because it hides which attacker did what, which is what players check against the table.
