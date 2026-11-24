# Typing in the dock, and the turn's log behind a "This turn" row

Status: Accepted (decided with Melissa, 2026-11-24, in the session building #43)

Before voice, seated phones type what happened (ADR 0069). Where that goes, and how players see what the app made of it:

- **The text box is in the dock.** A "Say what happened…" bar sits in the phone's bottom dock beside Next step, in the space the canvas keeps for Hold to talk. Tapping it opens a field above the keyboard; sending closes it. When voice arrives, the mic takes the same place, so the habit carries over. Next step becomes a compact button to make room.
- **"This turn · N things happened"** sits on the board, as the canvas reserves it. It opens a sheet listing each statement with who said it and what it was read as, in plain words ("Elena loses 3 life"), and what was tapped. A statement still being read shows "Interpreting…"; one the last attempt couldn't read shows "Couldn't interpret" with Try again (ADR 0067). The latest status also shows briefly beside the text box.
- **The Shared screen shows the same log, read-only**, in a side panel, so the whole table sees what was said and how it was read. It has no text box (ADR 0069).

## Consequences

- Every update carries the turn's log: its statements, how far the reading has got, whether a reading is under way or failed, and the timeline the board was replayed from. Devices word the entries themselves; the server sends the engine's entries, not text.
- Try again is a device message that asks for a fresh reading of the whole turn.

## Considered options

- **Typing inside the "This turn" sheet:** keeps the board clean, but costs a tap every time.
- **An always-visible field on the board:** fastest to reach, but takes board space on every phone all game.
- **A live list of statements on the board:** more at a glance, but crowds small phones.
- **Phones only:** the Shared screen could wait for the readback rail (ADR 0057).
