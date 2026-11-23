# Devices receive one update message with the full TableView

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

Each device holds one WebSocket to the game's Durable Object.

- **Server to device:** on every change, one message, `update { version, you, seats, started, view }`, with every seat (name, Deck, whether a device is connected), which seat this device holds, and, once the game has started, the full TableView. `version` rises with every change, so a device ignores anything older than what it has. There are no diffs: a TableView is a few kilobytes. An `error` message reports a rejected request.
- **Device to server:** in the lobby, `join`, `claim`, `watch`, `editSeat`, `removeSeat`, `reorder` and `start`. In the game, `adjustLife`, `nextStep` and `jumpToStep` (ADR 0056). Later tickets add statements and corrections.

The server computes the TableView (ADR 0003: the server's result wins), and devices don't run the engine for it. Messages from devices are untrusted and are checked against zod schemas, the library already chosen for the interpreter (ADR 0037), which the server package adds as a dependency.

## Consequences

- A reconnecting device gets the current state in its first message, with no separate catch-up step.
- Adding a message means adding a schema; anything that fails one gets an `error` and changes nothing.
