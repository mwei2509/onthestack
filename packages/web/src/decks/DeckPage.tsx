import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Chevron, More, SearchIcon } from '../icons.js';
import { DeckApiError, deleteDeck, fixLine, getDeck, markCommanders, renameDeck, skipLine, type DeckCard, type DeckDetail } from './api.js';
import { CardDetail, CardGrid, CardOverlay } from './CardImage.js';
import { CommanderPicker } from './CommanderPicker.js';
import { groupCards } from './groups.js';
import { Gems, IdentityWash } from './identity.js';
import { LoadError, PageHeader, Sheet } from './parts.js';
import { ProblemLine } from './ProblemLine.js';
import { CARD_FILTERS, filterCards, inShownOrder, stepFrom, type CardFilter } from './viewer.js';

type Open = 'menu' | 'rename' | 'delete' | 'commander' | null;
type CardView = 'list' | 'cards';

const VIEW_KEY = 'onthestack.deckView:v1';

/** Cards unless this device last chose List (ADR 0096). */
function loadView(): CardView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

function saveView(view: CardView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage can be refused (private windows); the view just isn't remembered.
  }
}

const WIDE = '(min-width: 1024px)';

/** Wide screens show the opened card in a panel beside the cards; phones open it over the page (ADR 0096). */
function useWide(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener('change', changed);
      return () => query.removeEventListener('change', changed);
    },
    () => window.matchMedia(WIDE).matches,
  );
}

/** One Deck: its commander, what needs a look and how to fix it, and the Deck viewer (ADR 0077, 0079, 0083, 0096, 0097). */
export function DeckPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [view, setView] = useState<CardView>(loadView);
  const [shown, setShown] = useState<DeckCard | null>(null);
  const [filter, setFilter] = useState<CardFilter>('All');
  const [query, setQuery] = useState('');
  const wide = useWide();

  const chooseView = (next: CardView) => {
    setView(next);
    saveView(next);
  };

  const load = useCallback(() => {
    setError(null);
    getDeck(id).then(setDeck, (e: unknown) => setError(e instanceof DeckApiError ? e.message : "Couldn't load the deck."));
  }, [id]);
  useEffect(load, [load]);

  /** Runs a change, showing what the server says if it fails. A Deck someone else changed is reloaded. */
  const act = async (change: () => Promise<DeckDetail | null>) => {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await change();
      if (updated) setDeck(updated);
      setSheet(null);
    } catch (e) {
      setActionError(e instanceof DeckApiError ? e.message : 'Something went wrong. Try again.');
      if (e instanceof DeckApiError && e.message.startsWith('Someone else changed')) load();
    } finally {
      setBusy(false);
    }
  };

  if (error) return <LoadError message={error} retry={load} />;
  if (!deck) return <div className="phone" aria-busy />;

  const commanders = deck.cards.filter((c) => c.commander);
  const cardCount = deck.cards.reduce((n, c) => n + c.quantity, 0);
  const toCheck = deck.unmatched.length + (commanders.length === 0 ? 1 : 0);
  const groups = groupCards(filterCards(deck.cards, filter, query));
  const inOrder = inShownOrder(groups);
  const searching = query.trim() !== '';
  const opened = wide ? (shown && inOrder.some((c) => c.scryfallId === shown.scryfallId && c.name === shown.name) ? shown : (inOrder[0] ?? null)) : shown;
  const step = (by: 1 | -1) => setShown(stepFrom(inOrder, opened, by));

  return (
    <div className="phone deck-page" style={{ gap: 16 }}>
      <PageHeader
        title={deck.name}
        back="/decks"
        backLabel="Back to decks"
        right={
          <button className="icon-btn" aria-label="Deck options" onClick={() => setSheet('menu')}>
            <More />
          </button>
        }
      />
      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}

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
            <span className="count">{toCheck}</span> {toCheck === 1 ? 'thing needs' : 'things need'} a look
          </h2>
          {commanders.length === 0 && (
            <div className="problem">
              <span className="problem-text">
                <span className="display" style={{ fontWeight: 700 }}>
                  No commander
                </span>
                <span className="problem-reason">Nothing in the list marks one</span>
              </span>
              <button className="btn" style={{ height: 44, padding: '0 14px', borderRadius: 12 }} onClick={() => setSheet('commander')} disabled={busy}>
                Choose
              </button>
            </div>
          )}
          {deck.unmatched.map((line, i) => (
            <ProblemLine
              key={`${i}:${line.text}`}
              line={line}
              busy={busy}
              onFix={(text) => act(() => fixLine(deck.id, i, line.text, text))}
              onSkip={() => act(() => skipLine(deck.id, i, line.text))}
            />
          ))}
        </section>
      )}

      <div className="deck-viewer">
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="section-label" style={{ fontSize: 12 }}>
              Cards
            </h2>
            <div className="segmented" role="group" aria-label="Show cards as">
              <button aria-pressed={view === 'cards'} onClick={() => chooseView('cards')}>
                Cards
              </button>
              <button aria-pressed={view === 'list'} onClick={() => chooseView('list')}>
                List
              </button>
            </div>
          </div>
          <div className="deck-filters">
            <label className="search">
              <span className="visually-hidden">Search this deck</span>
              <SearchIcon />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards or rules text" type="search" />
            </label>
            <div className="chips" role="group" aria-label="Filter by type">
              {(Object.keys(CARD_FILTERS) as CardFilter[]).map((f) => (
                <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          {groups.length === 0 ? (
            <p className="muted" style={{ margin: '8px 0' }}>
              No cards match.
            </p>
          ) : view === 'cards' ? (
            <CardGrid groups={groups} selected={wide ? opened : null} onOpen={setShown} />
          ) : (
            <div className="card-groups">
              {groups.map((g) => {
                const expanded = searching || open === g.group;
                return (
                  <div key={g.group}>
                    <button className="card-group" aria-expanded={expanded} onClick={() => setOpen(open === g.group ? null : g.group)}>
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
                            <button className="card-name" onClick={() => setShown(c)}>
                              {c.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        {wide && opened && (
          <aside className="deck-aside" aria-label="Selected card">
            <CardDetail key={opened.scryfallId + opened.name} card={opened} onStep={step} />
          </aside>
        )}
      </div>

      {!wide && opened && <CardOverlay card={opened} onStep={step} onClose={() => setShown(null)} />}

      {sheet === 'menu' && (
        <Sheet title={deck.name} onClose={() => setSheet(null)}>
          <div className="menu-list">
            <button
              className="btn"
              onClick={() => {
                setNewName(deck.name);
                setSheet('rename');
              }}
            >
              Rename
            </button>
            <button className="btn" onClick={() => setSheet('commander')}>
              {commanders.length > 0 ? 'Change commander' : 'Choose commander'}
            </button>
            <button className="btn danger" onClick={() => setSheet('delete')}>
              Delete deck
            </button>
          </div>
          {deck.archidektId && (
            <p className="hint" style={{ margin: 0 }}>
              Importing its Archidekt link again replaces this deck, its name and any fixes made here.
            </p>
          )}
        </Sheet>
      )}

      {sheet === 'rename' && (
        <Sheet title="Rename deck" onClose={() => setSheet(null)}>
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) void act(() => renameDeck(deck.id, newName));
            }}
          >
            <label className="field">
              Deck name
              <input className="display" value={newName} maxLength={60} autoFocus onChange={(e) => setNewName(e.target.value)} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy || newName.trim() === ''}>
              Save
            </button>
          </form>
        </Sheet>
      )}

      {sheet === 'delete' && (
        <Sheet title={`Delete ${deck.name}?`} onClose={() => setSheet(null)}>
          <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>
            It's removed from the library for everyone. Games that already started keep their copy.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flexGrow: 1, height: 56 }} onClick={() => setSheet(null)}>
              Keep it
            </button>
            <button
              className="btn danger"
              style={{ flexGrow: 1, height: 56 }}
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await deleteDeck(deck.id);
                  navigate('/decks', { replace: true });
                  return null;
                })
              }
            >
              Delete
            </button>
          </div>
        </Sheet>
      )}

      {sheet === 'commander' && (
        <CommanderPicker
          cards={deck.cards}
          busy={busy}
          onClose={() => setSheet(null)}
          onPick={(oracleIds) => act(() => markCommanders(deck.id, oracleIds))}
        />
      )}
    </div>
  );
}
