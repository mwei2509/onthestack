import { useState, useSyncExternalStore } from 'react';
import { Chevron, SearchIcon } from '../icons.js';
import type { DeckCard } from './api.js';
import { CardDetail, CardGrid, CardOverlay } from './CardImage.js';
import { groupCards } from './groups.js';
import { CARD_FILTERS, filterCards, inShownOrder, stepFrom, type CardFilter } from './viewer.js';

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

/** The Deck viewer's cards: Cards or List, search, type filters, and the opened card (ADR 0096, 0097). Read-only. */
export function DeckCards({ cards }: { cards: DeckCard[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<CardView>(loadView);
  const [shown, setShown] = useState<DeckCard | null>(null);
  const [filter, setFilter] = useState<CardFilter>('All');
  const [query, setQuery] = useState('');
  const wide = useWide();

  const chooseView = (next: CardView) => {
    setView(next);
    saveView(next);
  };
  const groups = groupCards(filterCards(cards, filter, query));
  const inOrder = inShownOrder(groups);
  const searching = query.trim() !== '';
  const opened = wide ? (shown && inOrder.some((c) => c.scryfallId === shown.scryfallId && c.name === shown.name) ? shown : (inOrder[0] ?? null)) : shown;
  const step = (by: 1 | -1) => setShown(stepFrom(inOrder, opened, by));

  return (
    <>
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
    </>
  );
}
