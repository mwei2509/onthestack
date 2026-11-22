# Live LLM evals run on demand, not on every pull request

Status: Accepted (decided with Melissa, 2026-11-22, in the planning session for #38).

Pull-request CI runs only the deterministic parts of the interpreter: prompt building, schema checks, name resolution and recorded responses. Live evals against real models run locally on demand and from a manually triggered GitHub workflow, because of rate limits, cost and flaky results. API keys live in an ignored local file for development and in GitHub secrets for the workflow.
