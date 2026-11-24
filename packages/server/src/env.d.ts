// Declared here rather than as `secrets.required` in wrangler.jsonc, which would make every deploy and Preview
// demand the secret. Without it, interpretations fail and the board keeps its last reading (ADR 0067).
interface Env {
  ANTHROPIC_API_KEY?: string;
}
