CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  archidekt_id TEXT UNIQUE,
  unmatched TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE deck_cards (
  deck_id TEXT NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  oracle_id TEXT NOT NULL REFERENCES cards (oracle_id),
  scryfall_id TEXT NOT NULL REFERENCES printings (scryfall_id),
  quantity INTEGER NOT NULL,
  commander INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (deck_id, position)
);

CREATE INDEX deck_cards_oracle ON deck_cards (oracle_id);
