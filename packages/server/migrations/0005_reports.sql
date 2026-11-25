-- What players reported as looking wrong, each with the game as it was then (ADR 0118).
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  game_code TEXT NOT NULL,
  turn INTEGER,
  step TEXT,
  reporter_seat TEXT,
  reporter_name TEXT,
  text TEXT NOT NULL,
  dump TEXT NOT NULL,
  dump_trimmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX reports_created ON reports (created_at);
