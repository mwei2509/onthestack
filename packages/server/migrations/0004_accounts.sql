-- Optional accounts (ADR 0088). Deleting an account removes its sign-in methods and sessions with it (ADR 0094).
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- One row per way to sign in. Only `passkey` for now, where external_id is the credential id; Google or Discord
-- would add their own kind with the provider's user id, which is why the passkey columns may be null.
CREATE TABLE sign_ins (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  public_key BLOB,
  counter INTEGER,
  transports TEXT,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT,
  UNIQUE (kind, external_id)
);

CREATE INDEX sign_ins_account ON sign_ins (account_id);

-- Only the SHA-256 of a session's token is stored (ADR 0090).
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  renewed_at TEXT NOT NULL
);

CREATE INDEX sessions_account ON sessions (account_id);

-- A passkey prompt's one-time challenge, good for 5 minutes (ADR 0103).
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  created_at TEXT NOT NULL
);
