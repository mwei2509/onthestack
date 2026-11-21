# The LLM is chosen by evals, free tier first

Command parsing, card Translation and the Rules assistant call an LLM through a provider-agnostic interface. We write the evals first (transcript to expected Command, Oracle text to expected Translation) and use the cheapest model that passes them: free tiers first (for example Gemini Flash-Lite, or a Workers AI model), with Claude Haiku as the paid fallback behind a hard monthly cap of about $5. At one group's volume Haiku costs well under $1/month, plus about $1 to translate a few thousand cards once.

## Consequences

Gemini's free tier uses prompts for training. That covers confirmed transcripts and card text, never audio; switching to its paid tier or another provider removes it.
