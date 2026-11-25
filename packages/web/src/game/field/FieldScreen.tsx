import type { TableView } from '@onthestack/engine';
import { useEffect, useState } from 'react';
import { IdentityWash } from '../../decks/identity.js';
import { Compose } from '../log/TurnLog.js';
import { Avatar } from '../parts.js';
import type { BoardPlayer } from '../board/model.js';
import type { ScreenProps } from '../useGame.js';
import { cardFacts, pileOf } from './facts.js';
import { FieldZones } from './FieldCards.js';
import { GameDeckView } from './GameDeckView.js';
import type { GameDecks } from './gameDecks.js';
import { fieldZones } from './layout.js';

type Tab = 'field' | 'grave' | 'exile';

interface Selected {
  name: string;
  typeLine: string;
  facts: string[];
  text: string;
}

/**
 * A player's battlefield, graveyard and exile (ADR 0126). Seat coins switch players; any device can look at any
 * player's cards. Hands and libraries are never shown. `game` is absent once the game has ended or offline, which
 * hides "Not right?" (ADR 0128). `you` is null on a Shared screen, which speaks for the field's player instead and
 * lays the screen out wide.
 */
export function FieldScreen({
  view,
  players,
  you,
  start,
  decks,
  game,
  onClose,
}: {
  view: TableView;
  players: BoardPlayer[];
  you: string | null;
  start: string;
  decks: GameDecks | null;
  game?: ScreenProps['game'];
  onClose: () => void;
}) {
  const [who, setWho] = useState(start);
  const [tab, setTab] = useState<Tab>('field');
  const [selected, setSelected] = useState<{ key: string; card: Selected } | null>(null);
  const [fixing, setFixing] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  useEffect(() => {
    if (deckOpen || fixing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, deckOpen, fixing]);

  const player = players.find((p) => p.id === who) ?? players[0]!;
  const info = (name: string) => decks?.cards.get(name);
  const identityOf = (name: string) => info(name)?.colorIdentity ?? [];
  const zones = fieldZones(view, player.id);
  const fieldCount = zones.reduce((n, z) => n + z.groups.reduce((m, g) => m + g.untapped + g.tapped, 0), 0);
  const grave = pileOf(view, player.id, 'grave');
  const exile = pileOf(view, player.id, 'exile');
  const pile = tab === 'grave' ? grave : tab === 'exile' ? exile : [];
  const choose = (key: string, card: Selected) => setSelected((s) => (s?.key === key ? null : { key, card }));
  const switchTo = (next: { who?: string; tab?: Tab }) => {
    if (next.who) setWho(next.who);
    if (next.tab) setTab(next.tab);
    setSelected(null);
  };
  const title = player.id === you ? 'Your field' : `${player.name}'s field`;
  const deck = decks?.decks.find((d) => d.seatId === player.id);

  return (
    <div className={`field-screen${you === null ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="field-header">
        <button className="icon-btn" aria-label="Back to the board" onClick={onClose}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 5l-6 6 6 6" />
          </svg>
        </button>
        <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>
            {title}
          </span>
          {player.commander && <span className="seat-sub" style={{ fontSize: 12 }}>{player.commander}</span>}
        </div>
        {deck && (
          <button className="btn" style={{ height: 40, padding: '0 12px' }} onClick={() => setDeckOpen(true)}>
            Deck
          </button>
        )}
        <span className="field-life">
          <span className="muted" style={{ fontSize: 10, letterSpacing: '0.1em' }}>
            LIFE
          </span>
          <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>
            {player.life}
          </span>
        </span>
      </header>

      <nav className="field-seats" aria-label="Whose cards">
        {players.map((p) => (
          <button key={p.id} className="field-seat" aria-pressed={p.id === player.id} onClick={() => switchTo({ who: p.id })}>
            <Avatar name={p.name} colour={p.ring} size={34} active={p.id === player.id} />
            <span>{p.id === you ? 'You' : p.name}</span>
          </button>
        ))}
      </nav>

      <div className="field-tabs" role="tablist">
        {(
          [
            ['field', `Field ${fieldCount}`],
            ['grave', `Graveyard ${grave.length}`],
            ['exile', `Exile ${exile.length}`],
          ] as const
        ).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`field-tab${tab === key ? ' on' : ''}`} onClick={() => switchTo({ tab: key })}>
            {label}
          </button>
        ))}
      </div>

      <div className="field-body">
        {player.out ? (
          <div className="field-fallen">
            <span className="display" style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)' }}>
              Fallen
            </span>
            <span className="muted">{player.name} is out of the game. Their cards have left the battlefield.</span>
          </div>
        ) : tab === 'field' ? (
          zones.length ? (
            <FieldZones
              zones={zones}
              identityOf={identityOf}
              selected={selected?.key}
              onPick={(g) => {
                const card = info(g.card);
                choose(g.key, { name: g.card, typeLine: card?.typeLine ?? (g.isToken ? 'Token' : ''), facts: cardFacts(g, card), text: card?.oracleText ?? '' });
              }}
            />
          ) : (
            <p className="muted field-empty">Nothing on the battlefield.</p>
          )
        ) : pile.length ? (
          <div className="field-pile">
            {pile.map((name, i) => {
              const card = info(name);
              const key = `${tab}${i}`;
              return (
                <button
                  key={key}
                  className={`pile-card${tab === 'exile' ? ' exiled' : ''}`}
                  aria-pressed={selected?.key === key}
                  onClick={() => choose(key, { name, typeLine: card?.typeLine ?? '', facts: [tab === 'grave' ? 'In the graveyard' : 'In exile'], text: card?.oracleText ?? '' })}
                >
                  <span className="pile-card-name">{name}</span>
                  <span className="field-card-art">
                    <IdentityWash identity={identityOf(name)} strength={0.6} />
                  </span>
                  <span className="pile-card-type">{card?.typeLine ?? ''}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted field-empty">{tab === 'grave' ? 'Nothing in the graveyard.' : 'Nothing in exile.'}</p>
        )}
      </div>

      {selected && (
        <section className="field-sheet" aria-label={selected.card.name}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>
                {selected.card.name}
              </span>
              {selected.card.typeLine && <span className="muted" style={{ fontSize: 13 }}>{selected.card.typeLine}</span>}
            </div>
            <button className="icon-btn" aria-label="Close" onClick={() => setSelected(null)}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
          <div className="field-facts">
            {selected.card.facts.map((f) => (
              <span key={f} className="field-fact">
                {f}
              </span>
            ))}
          </div>
          {selected.card.text ? <p className="field-text">{selected.card.text}</p> : <p className="muted field-text">No rules text for this card in the game's Decks.</p>}
          {game && (
            <button className="btn" style={{ alignSelf: 'flex-start', height: 44 }} onClick={() => setFixing(true)}>
              Not right?
            </button>
          )}
        </section>
      )}
      {fixing && game && <Compose game={game} as={you === null ? { id: player.id, name: player.name } : undefined} onClose={() => setFixing(false)} />}
      {deckOpen && deck && <GameDeckView deck={deck} whose={player.id === you ? 'Your Deck' : `${player.name}'s Deck`} onClose={() => setDeckOpen(false)} />}
    </div>
  );
}
