import type { SeatView } from '@onthestack/server/protocol';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listDecks, type DeckSummary } from '../../decks/api.js';
import { deckMeta, matchesSearch } from '../../decks/format.js';
import { Gems, identityRing } from '../../decks/identity.js';
import { Sheet } from '../../decks/parts.js';
import { Avatar } from '../parts.js';

export type SeatDeck = NonNullable<SeatView['deck']>;

const summaryOf = (d: DeckSummary): SeatDeck => ({ id: d.id, name: d.name, commanders: d.commanders, colorIdentity: d.colorIdentity });

/** The Deck a seat plays, picked from the library (ADR 0080), with a way to import one and come back (ADR 0087). */
export function DeckPicker({
  deck,
  code,
  seatId,
  onPick,
}: {
  deck: SeatDeck | null;
  code: string;
  /** The seat being edited, so an import comes back to that seat. */
  seatId?: string;
  onPick: (deck: SeatDeck) => void;
}) {
  const importLink = `/decks/import?return=${encodeURIComponent(`/g/${code}`)}${seatId ? `&seat=${seatId}` : ''}`;
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>Deck</span>
      <button type="button" className="deck-choice" onClick={() => setOpen(true)}>
        {deck ? (
          <>
            <Avatar name={deck.commanders[0] ?? deck.name} colour={identityRing(deck.colorIdentity)} size={38} />
            <span className="deck-choice-text">
              <span className="display" style={{ fontSize: 16, fontWeight: 700 }}>
                {deck.name}
              </span>
              <span className="deck-row-commander" style={{ fontSize: 13 }}>
                {deck.commanders.length > 0 ? deck.commanders.join(' & ') : 'No commander yet'}
              </span>
            </span>
            <span className="accent-text">Change</span>
          </>
        ) : (
          <>
            <span className="deck-choice-text muted">Pick a deck from the library</span>
            <span className="accent-text">Choose</span>
          </>
        )}
      </button>
      <Link className="btn btn-text muted" to={importLink} style={{ alignSelf: 'flex-start', height: 40, textDecoration: 'none' }}>
        + Import a deck instead
      </Link>
      {open && (
        <LibrarySheet
          chosen={deck?.id}
          onClose={() => setOpen(false)}
          onPick={(d) => {
            onPick(summaryOf(d));
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function LibrarySheet({ chosen, onPick, onClose }: { chosen?: string; onPick: (deck: DeckSummary) => void; onClose: () => void }) {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => {
    listDecks().then(setDecks, () => setError(true));
  }, []);
  const shown = (decks ?? []).filter((d) => matchesSearch(d, search));

  return (
    <Sheet title="Pick a deck" onClose={onClose}>
      {error && (
        <p role="alert" className="form-error">
          Couldn't load the decks. Check your connection and try again.
        </p>
      )}
      {decks && decks.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No decks in the library yet. Import one first.
        </p>
      )}
      {decks && decks.length > 0 && (
        <>
          <label className="search">
            <span className="visually-hidden">Search decks</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by deck or commander" type="search" style={{ paddingLeft: 14 }} />
          </label>
          <ul className="picker-list" aria-label="Decks">
            {shown.map((d) => (
              <li key={d.id}>
                <button aria-pressed={d.id === chosen} onClick={() => onPick(d)}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="display">{d.name}</span>
                      <Gems identity={d.colorIdentity} />
                    </span>
                    <span className="deck-row-commander" style={{ fontSize: 13, fontWeight: 400 }}>
                      {d.commanders.length > 0 ? d.commanders.join(' & ') : 'No commander yet'}
                    </span>
                    <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>
                      {deckMeta(d, new Date())}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
