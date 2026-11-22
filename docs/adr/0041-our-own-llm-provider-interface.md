# A thin LLM provider interface of our own

Status: Accepted (decided with Melissa, 2026-11-22, in the planning session for #38).

The interpreter calls an LLM through one small interface of its own: send this prompt, get back JSON that matches this schema (ADR 0037). Each provider is a small adapter behind it. The Claude adapter uses the official `@anthropic-ai/sdk`, whose structured-output helper validates against the Zod schema directly; the others call their HTTP APIs with `fetch`. A recorded-response adapter replays saved responses, so the pure parts are tested without a network.

## Considered options

- **Vercel AI SDK:** smooths over provider quirks, but adds several dependencies for a one-call surface.
- **`fetch` for every provider, Claude included:** one fewer dependency, but reimplements what the official SDK already does for structured output and errors.
