# Readback notes sit in the log and the tray, and the tray holds what's new since the last reading

Status: Accepted (decided with Melissa, 2026-11-27, in the session grilling #173)

Amends ADR 0057 (where notes sit, and "until someone dismisses them").

**Where.** Every note, open or not, sits in the "This turn" log under the entry that led to it, the way RulesWarnings do (ADR 0122); combat damage under the attack declaration, a trigger under the entry whose event triggered it, and a note no entry led to at its Step's place. Open notes also sit in the readback tray above the dock on phones. On a Shared screen, open notes are pinned at the top of the log panel instead of a separate side rail.

**What's open.** When a reading lands, each device compares the new notes with the ones from before, matching on kind, source card, causing statements and outcome, with an order number between identical notes. Notes that are new, or whose outcome changed (a late block takes damage from 3 to 1), go in the tray. The rest leave it: a note leaves the tray when the next reading lands, when the turn ends, or when it's dismissed. With more than two open, the tray shows the newest two and "+N more", which opens the log. These rules are for notes only; the interpreter's PlayerQuestions in the tray (ADR 0068) stay until answered.

**Dismissing** only affects the device it's done on and lasts until the next reading. Each player checks the app's work for themselves, and one player dismissing a note shouldn't hide it from someone who hasn't read it. Nothing is stored on the server or recorded in history, and because nothing has to survive a re-read, no lasting key is needed.

**Life.** While notes are open, each device shows the net life change from the notes in its own tray beside each player's life (Ana −3, Priya +3). Poison and commander damage aren't shown this way.

Shared dismissal like "Do it anyway" (ADR 0123) was rejected because one player would hide a note from everyone. A lasting per-note dismissal key was rejected as unneeded once the tray clears on each reading: event ids are numbered by replay position, so they shift when an earlier entry changes, and matching them across re-reads would mean the content matching above anyway. A timer was rejected because a player with the phone face down would miss notes, and the readback is the main way a wrong Translation is noticed. Showing only new notes, never changed ones, was rejected because a corrected outcome would only show in the log.
