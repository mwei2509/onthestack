# A full rules engine, fed by the conversation

Status: Accepted (decided with Melissa, 2026-11-21, in the design session reviewing the engine PRs).

If players narrated every action, On The Stack should behave like a full rules engine such as XMage or Arena's. What makes it different is not the engine but the input: the interpreter turns a table conversation into GameActions and fills in what players leave unsaid. So the engine adopts proven patterns from existing engines rather than inventing simplified ones, and the interpreter is where the product's originality goes.

It still differs from those engines in what it can know: hands and libraries are unknown, players can override anything, and the board can be corrected. Patterns are adopted where they fit that; whole engines are not embedded.
