# Hold-to-talk instead of a wake phrase

Status: Accepted (decided with Melissa, 2026-11-21).

Amended by ADR 0107 (on a Shared screen, the seat whose card was used is the speaker).

The proposal captured commands after an on-device "Hey Stack" wake phrase. We use hold-to-talk on each player's Phone instead. A Commander table talks constantly ("is that a flyer? can I do this?") between declarations, so holding the button is a deliberate "this is what's happening" signal that keeps table talk out. It also removes end-of-speech guessing (the table rarely goes quiet), avoids an always-on microphone, and tells the app who is speaking.

## Considered options

- **Wake phrase with silence detection:** hands-free, but false wake-ups and unreliable end-of-speech detection at a noisy table, plus a custom wake model to train.
- **Speaker recognition by enrolled voice:** short commands from a distant mic in a noisy room misattribute silently.

## Consequences

Capture sits behind a replaceable boundary, so a wake phrase with players speaking in the third person ("Elena blocks with Amalia") can be tried in a later playtest without changing how speakers are resolved: "I" is the Phone that captured the Command, and a named player is that player.
