-- A Deck's cards are kept in versions; a game refers to the version each seat brought (ADR 0119).
-- deck_id has no foreign key: a version a game uses must outlive its Deck.
CREATE TABLE deck_versions (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (deck_id, number)
);

CREATE TABLE deck_version_cards (
  version_id TEXT NOT NULL REFERENCES deck_versions (id),
  position INTEGER NOT NULL,
  oracle_id TEXT NOT NULL REFERENCES cards (oracle_id),
  scryfall_id TEXT NOT NULL REFERENCES printings (scryfall_id),
  quantity INTEGER NOT NULL,
  commander INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (version_id, position)
);

ALTER TABLE decks ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

INSERT INTO deck_versions (id, deck_id, number, created_at) SELECT id || '.1', id, 1, imported_at FROM decks;

INSERT INTO deck_version_cards (version_id, position, oracle_id, scryfall_id, quantity, commander)
SELECT deck_id || '.1', position, oracle_id, scryfall_id, quantity, commander FROM deck_cards;

DROP TABLE deck_cards;

CREATE INDEX deck_version_cards_oracle ON deck_version_cards (oracle_id);
