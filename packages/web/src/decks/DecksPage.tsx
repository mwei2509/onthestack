import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Chevron, SearchIcon } from '../icons.js';
import { DeckApiError, listDecks, type DeckSummary } from './api.js';
import { deckMeta, matchesSearch } from './format.js';
import { Gems, IdentityWash } from './identity.js';
import { ImportForm } from './ImportForm.js';
import { LoadError, PageHeader } from './parts.js';

/** The shared library (ADR 0048): every saved Deck, searchable by name or commander. */
export function DecksPage() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setError(null);
    listDecks().then(setDecks, (e: unknown) => setError(e instanceof DeckApiError ? e.message : "Couldn't load the decks."));
  }, []);
  useEffect(load, [load]);

  if (error) return <LoadError message={error} retry={load} />;
  if (!decks) return <div className="phone" aria-busy />;

  if (decks.length === 0) {
    return (
      <div className="phone">
        <PageHeader title="Decks" back="/" backLabel="Back to home" />
        <section className="decks-empty">
          <div className="empty-cards" aria-hidden>
            <span />
            <span />
          </div>
          <h2 className="display">No decks yet</h2>
          <p className="muted">Saved decks are shared by everyone who plays here, so anyone can pick one when joining a game.</p>
        </section>
        <section className="panel">
          <h2 className="display" style={{ margin: 0, fontSize: 18 }}>
            Import a deck
          </h2>
          <ImportForm onImported={(deck) => navigate(`/decks/${deck.id}`)} />
        </section>
      </div>
    );
  }

  const now = new Date();
  const shown = decks.filter((d) => matchesSearch(d, search));
  return (
    <div className="phone" style={{ gap: 14 }}>
      <PageHeader
        title="Decks"
        back="/"
        backLabel="Back to home"
        right={
          <Link className="btn btn-light" to="/decks/import" style={{ height: 44, fontSize: 15, textDecoration: 'none' }}>
            + Import
          </Link>
        }
      />
      <label className="search">
        <span className="visually-hidden">Search decks</span>
        <SearchIcon />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by deck or commander" type="search" />
      </label>
      <ul className="deck-list">
        {shown.map((d) => (
          <li key={d.id}>
            <Link className="deck-row" to={`/decks/${d.id}`}>
              <IdentityWash identity={d.colorIdentity} />
              <span className="deck-row-text">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="display deck-row-name">{d.name}</span>
                  <Gems identity={d.colorIdentity} />
                </span>
                <span className="deck-row-commander">{d.commanders.length > 0 ? d.commanders.join(' & ') : 'No commander'}</span>
                <span className="faint" style={{ fontSize: 12 }}>
                  {deckMeta(d, now)}
                </span>
              </span>
              {d.problems > 0 && <span className="warn-chip">{d.problems} to check</span>}
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
          No decks match “{search.trim()}”.
        </p>
      )}
      <p className="faint" style={{ margin: 0, fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>
        Importing an Archidekt link you've used before updates that deck.
      </p>
    </div>
  );
}
