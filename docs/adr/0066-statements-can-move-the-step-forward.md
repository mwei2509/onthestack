# Statements can move the current Step forward

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #43).

The Game Durable Object stores the current Step, moved by Next step and the step menu (ADR 0074, 0075), and replays the turn up to it. A statement that places something in a later Step ("Goblin attacks Michael" while the table is in main 1) would otherwise not show, because the replay stops before it.

Until #47 is built, the current Step is the later of the stored Step and the latest Step any timeline entry is placed in, and the stored Step advances to match. Typing an attack moves the table to declare attackers. Statements never move it backwards: placing something in an earlier Step is a late statement, replayed where it belongs.

## Consequences

- Superseded in part when #47 adds the interpreter's `currentStep` and `turnEnded` (decided on #47, 2026-11-23).
