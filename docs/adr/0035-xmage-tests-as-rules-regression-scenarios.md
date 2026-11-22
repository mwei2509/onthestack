# XMage's tests as rules-regression scenarios

Status: Accepted (decided with Melissa, 2026-11-21, in the design session on the XMage research).

XMage has about 8,100 declarative card-interaction tests (MIT). The engine gets a small scenario-test helper in the same style (set up a board, act, assert life and zones), and XMage scenarios are adapted into it as rules-regression tests, each citing the XMage test it came from. XMage's licence notice goes in a third-party notices file. The first ports are the five scenarios named in `docs/research/xmage-engine.md`, three of which expose bugs in the first engine build.
