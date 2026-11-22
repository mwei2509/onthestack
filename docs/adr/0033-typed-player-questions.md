# PlayerQuestions come in typed kinds

Status: Accepted (decided with Melissa, 2026-11-21, in the design session on the XMage research). Amended by ADR 0043 (the interpreter asks them too, and adds the `whichStep` kind).

A PlayerQuestion is one of a fixed set of kinds, modelled on XMage's player queries and Arena's request messages: choose a target, choose a mode, order your triggers, yes or no, choose an amount, divide damage, choose cards, pay a cost, and similar, plus **tell a hidden fact** ("what did you reveal?", "what did you draw?"), which no other engine needs because they can see every hand and library. The answers come from the interpreter reading the conversation; a typed kind tells it exactly what shape the answer must take. The exact list is settled when PlayerQuestions are built (`docs/research/xmage-engine.md` proposes eleven).
