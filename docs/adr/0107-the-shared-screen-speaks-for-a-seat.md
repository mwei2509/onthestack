# The Shared screen speaks for a seat, from that seat's card

Status: Accepted (decided with Melissa, 2026-11-24, in the session building #43)

Amends ADR 0069 (only seated devices type) and ADR 0001 (the phone that captured a statement is its speaker). A Shared screen can now say what happened for any player:

- **From the player's card.** Each seat card on the Shared screen has a "Say…" button. It opens the same text box as the phone's dock (ADR 0106), headed "Saying as Theo". Tapping the rest of the card stays free for showing that player's board later.
- **The statement is that player's.** It counts exactly as if Theo had typed it on his phone: "I" means Theo. This also covers a player whose phone died or who has none. Anyone at the Shared screen can speak for any seat, as anyone with the game's code is trusted (ADR 0052). A seated phone still speaks only as its own seat.
- **Questions can be answered there too.** Question cards in the Shared screen's panel get the same quick answers as the asked player's phone (ADR 0068), sent as the asked player's statement.
- **When voice arrives** (#44), the same button becomes hold-to-talk for that player, and the seat, not the device that captured the audio, is the speaker.

## Consequences

- A statement message can name the seat it speaks for. A device without a seat must name one; a seated device may only name its own.
- The record doesn't say which device a statement came from, only whose it is.

## Considered options

- **Tap anywhere on the card:** a bigger target, but showing a player's board would need another gesture later.
- **Marking statements said at the Shared screen:** the log would show "Theo, at the table", at the cost of a new field on every statement.
- **Questions answered only from phones:** simpler, but a player without a phone couldn't answer.
- **Deciding the voice part with #44:** possible, but the button is the same either way.
