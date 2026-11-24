# A debug panel shows a game's last interpretations

Status: Accepted (decided with Melissa, 2026-11-24, in the session looking into a missing RulesWarning)

Extends ADR 0069 (what the Game object stores).

The Game object keeps its last 10 interpretations, across turns: when each was asked, the turn and transcript version, the user message sent, the raw answer or the error, the model, tokens and latency (the same fields as ADR 0108's log line). They're kept apart from the turn and never go into a Sealed turn's history.

Opening a game with `?debug` in its address shows a panel with them, newest first. Any device in the game can open it, seated or not. The panel asks the Game object for them when it opens, so ordinary updates don't carry them.

## Consequences

- Reading one game's interpretations at the table needs no Cloudflare access.
- Prompts are a few kilobytes each, so ten of them stay small in the Game object's storage.

## Considered options

- **Workers Logs alone** (ADR 0108): good for history, but needs the dashboard and a search to find one game.
- **Seated devices only:** the Shared screen is often the easiest place to read it.
