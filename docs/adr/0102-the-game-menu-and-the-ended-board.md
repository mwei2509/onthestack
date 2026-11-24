# The Game menu, and what an ended game looks like

Status: Accepted (decided with Melissa, 2026-11-24, in the session that planned #106)

**End game lives in a new Game menu**, opened from a button in the board's header on every seated device and the shared screen. It isn't in the Step menu, which on someone else's phone sits behind "Move their turn on". The confirm happens inside the menu: "End the game for everyone? The final board is kept, read-only. This can't be undone." with Cancel and End game. End game is disabled while the device is offline. The menu gives later items, like settings, a home.

**An ended game keeps its board layout, with the controls gone:**

- **Phones:** "Game ended" replaces whose turn it is and an "Ended" pill replaces "Online". The life buttons and the Step dock are hidden, not greyed out. In their place: "Ended on turn 7, in Theo's turn · 9:42 pm" and a link back to the start. No active-player glow or turn tags.
- **The shared screen:** the same frozen seats, with "Game over · Turn 7" in place of the Step strip and its controls. The join code is gone; the game's code stays.
- **A device with no seat** goes straight to the read-only board in the shared screen's layout, without being asked to pick a seat and without being remembered as watching.

The sealed turns' history isn't shown yet: no game has a history screen so far. That is its own piece of work.

## Considered options

- **End game at the bottom of the Step menu:** no new button, but it would be behind the turn gate on other players' phones.
- **A separate "game over" summary screen:** more to build, and the board is what people want to look at.
- **Asking a device without a seat to pick one:** a seat gives nothing to do in an ended game.
