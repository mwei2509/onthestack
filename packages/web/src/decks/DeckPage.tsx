import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Chevron } from '../icons.js';
import { DeckApiError, getDeck, type DeckDetail } from './api.js';
import { groupCards } from './groups.js';
import { Gems, IdentityWash } from './identity.js';
import { LoadError, PageHeader } from './parts.js';

const REASON = { 'not-found': 'No card by that name', unreadable: "Couldn't read this line" } as const;

/** One Deck: its commander, what needs a look, and its cards by type (ADR 0077, 0084). */
export function DeckPage() {
  const { id = '' } = useParams();
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    getDeck(id).then(setDeck, (e: unknown) => setError(e instanceof DeckApiError ? e.message : "Couldn't load the deck."));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <LoadError message={error} retry={load} />;
  if (!deck) return <div className="phone" aria-busy />;

  const commanders = deck.cards.filter((c) => c.commander);
  const cardCount = deck.cards.reduce((n, c) => n + c.quantity, 0);
  const toCheck = deck.unmatched.length + (commanders.length === 0 ? 1 : 0);

  return (
    <div className="phone" style={{ gap: 16 }}>
      <PageHeader title={deck.name} back="/decks" backLabel="Back to decks" />

      <section className="commander-card">
        <IdentityWash identity={deck.colorIdentity} strength={0.24} />
        <div className="commander-frame" aria-hidden>
          <Gems identity={deck.colorIdentity} size={9} />
        </div>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span className="section-label" style={{ fontSize: 11 }}>
            Commander
          </span>
          <span className="display" style={{ fontSize: 19, fontWeight: 800 }}>
            {commanders.length > 0 ? commanders.map((c) => c.name).join(' & ') : 'None marked'}
          </span>
          <span className="muted" style={{ fontSize: 14 }}>
            <span className="num" style={{ color: 'var(--text)', fontWeight: 700 }}>
              {cardCount}
            </span>{' '}
            cards · {deck.archidektId ? 'Archidekt' : 'pasted list'}
          </span>
        </div>
      </section>

      {toCheck > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className="section-label" style={{ color: 'var(--danger)', fontSize: 12 }}>
            {toCheck} {toCheck === 1 ? 'thing needs' : 'things need'} a look
          </h2>
          {commanders.length === 0 && (
            <div className="problem">
              <span className="problem-text">
                <span className="display" style={{ fontWeight: 700 }}>
                  No commander
                </span>
                <span className="problem-reason">Nothing in the list marks one</span>
              </span>
            </div>
          )}
          {deck.unmatched.map((line, i) => (
            <div className="problem" key={i}>
              <span className="problem-text">
                <span className="mono">{line.text}</span>
                <span className="problem-reason">{REASON[line.reason]}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 className="section-label" style={{ fontSize: 12 }}>
          Cards
        </h2>
        <div className="card-groups">
          {groupCards(deck.cards).map((g) => {
            const expanded = open === g.group;
            return (
              <div key={g.group}>
                <button className="card-group" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : g.group)}>
                  <span>{g.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="count muted">{g.count}</span>
                    <Chevron open={expanded} />
                  </span>
                </button>
                {expanded && (
                  <ul className="card-names">
                    {g.cards.map((c) => (
                      <li key={c.scryfallId + c.name}>
                        <span className="count faint">{c.quantity}</span>
                        <span>{c.name}</span>
                        {c.commander && <span className="commander-tag">Commander</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
