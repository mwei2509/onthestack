CREATE TABLE cards (
  oracle_id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  data TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE INDEX cards_name ON cards (name);

CREATE TABLE printings (
  scryfall_id TEXT PRIMARY KEY,
  oracle_id TEXT NOT NULL REFERENCES cards (oracle_id),
  set_code TEXT NOT NULL COLLATE NOCASE,
  collector_number TEXT NOT NULL,
  image_url TEXT,
  back_image_url TEXT
);

CREATE INDEX printings_set_number ON printings (set_code, collector_number);
