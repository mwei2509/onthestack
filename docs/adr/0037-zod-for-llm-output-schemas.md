# Zod defines and checks what an LLM returns

Status: Accepted (decided with Melissa, 2026-11-22, in the planning session for #38).

Everything an LLM returns (the InterpretedTimeline now, card Translations later) is defined once as a Zod schema. The same definition validates the response and is turned into the JSON Schema that providers use for structured output, so the type, the check and the instructions to the model can't drift apart. Zod runs on Workers.

## Considered options

- **Valibot:** smaller, but needs an add-on for JSON Schema.
- **TypeBox:** JSON Schema first, with weaker TypeScript ergonomics for the transforms we need.
- **Hand-written checks:** a second copy of every type, and no JSON Schema.
