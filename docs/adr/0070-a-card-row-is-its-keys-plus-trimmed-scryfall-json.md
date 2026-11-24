# A stored card is its lookup keys plus trimmed Scryfall JSON

Status: Accepted (decided with Melissa, 2026-11-23, in a Claude Code session)

Refines ADR 0044, which stores one row per card in a D1 `cards` table keyed by Scryfall Oracle ID, keeping "only the fields the app uses". A row has columns only for what we look cards up or manage them by: `oracle_id` (primary key), `name` (indexed, matched case-insensitively), and `fetched_at`. Everything else is one `data` JSON column holding a trimmed copy of Scryfall's card object:

- `name`, `mana_cost`, `cmc`, `type_line`, `oracle_text`, `power`, `toughness`, `loyalty`, `keywords`, `colors`, `color_identity`, `layout`
- `card_faces` for multi-faced cards, each face with its `name`, `mana_cost`, `type_line`, `oracle_text`, `power`, `toughness` and `loyalty`

Field names stay Scryfall's, so the trimming is a plain pick and `stx cards refresh` can compare a stored row with a fresh fetch field by field. Turning a row into the engine's `CardDefinition` (types and supertypes split out of the type line, and so on) is a separate pure function, written when games first use card data (#45).

## Consequences

- Adding a field the app starts to need is a code change and a refresh, not a migration.
- SQL can't filter on fields inside `data` without JSON functions. Nothing needs to: cards are only ever looked up by Oracle ID, printing or name.

## Considered options

- **One column per field, faces in a child table:** every field is queryable, but each new field is a migration and every read of a double-faced card joins.
