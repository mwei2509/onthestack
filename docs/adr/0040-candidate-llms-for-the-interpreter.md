# Candidate LLMs: a Workers AI model, Gemini Flash-Lite and Claude Haiku 5.5

Status: Accepted (decided with Melissa, 2026-11-22, in the planning session for #38). The choice from the evals is ADR 0047.

Refines ADR 0010. The evals compare three candidates: a Workers AI model and Gemini Flash-Lite on their free tiers, and Claude Haiku 5.5 as the paid quality ceiling. Haiku 5.5 is priced at $0.10 per million input tokens and $0.50 per million output, which puts one interpretation at about $0.0015, a full eval run at about $0.10 and a four-player game at about $1–2. Its API key carries a spend cap of about $5 a month (ADR 0010). The model used in games is the cheapest one that passes the evals, recorded in a later ADR from the results.

## Consequences

Gemini's free tier trains on prompts. That covers eval fixtures and typed or transcribed statements, never audio (ADR 0010).
