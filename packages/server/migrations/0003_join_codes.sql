-- Six-digit join codes (ADR 0095). A code is free once its game has been idle for 24 hours (or ended), so a row is
-- only taken over when its active_at is older than that.
CREATE TABLE join_codes (
  code TEXT PRIMARY KEY,
  game_code TEXT NOT NULL,
  active_at TEXT NOT NULL
);

CREATE INDEX join_codes_game ON join_codes (game_code);
