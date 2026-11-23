# A failed interpretation keeps the last good reading

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #43).

An interpretation can fail: the provider is down or rate-limited, or the answer fails validation twice (ADR 0046). When it does, the board keeps the last InterpretedTimeline that was applied. The PlayerStatements it didn't cover show "couldn't interpret" with a Try again button. Because every interpretation re-reads the whole turn, the next statement anyone makes retries them too. Nothing is dropped, nothing blocks play (principle 3), and a player can always fix the board with a tap or a BoardCorrection.
