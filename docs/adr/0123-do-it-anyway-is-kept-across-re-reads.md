# "Do it anyway" is kept across re-reads, and anyone can choose it

Status: Accepted (decided with Melissa, 2026-11-24, in the session planning #50)

Any seated player can choose "Do it anyway" on a RulesWarning, not only the player whose action raised it. The physical board is the source of truth, and a phone that's away from the table shouldn't hold up play.

The Game keeps the turn's overrides, recording who chose each one, and passes them to every replay. An override matches a warning with the same code, raised from the same statements (`from`), about the same objects. A matching warning stays in the replay result, marked overridden: the log shows it settled rather than hiding it. The history records a `WarningOverridden` TableEvent naming the player, and it's kept when the turn is Sealed.

Statements keep their ids when a re-read reorders entries, so overrides survive reordering. If a later statement changes the action, its `from` changes and the warning shows again, which is wanted: it's a different action now. Matching by card names was rejected because dismissing one warning would hide a later, different one about the same card. Matching by message text was rejected because wording and ids shift between replays.
