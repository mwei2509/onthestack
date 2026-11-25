import type { GameDeck } from '@onthestack/server/decks';
import { useEffect } from 'react';
import { DeckCards } from '../../decks/DeckCards.js';
import { Gems, IdentityWash } from '../../decks/identity.js';

/**
 * A seat's Deck as the version it brought to the game, read-only (ADR 0129). The decklist only: never the order of a
 * library or what's in a hand. `whose`: "Your Deck" or "Theo's Deck".
 */
export function GameDeckView({ deck, whose, onClose }: { deck: GameDeck; whose: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const commanders = deck.cards.filter((c) => c.commander);
  const count = deck.cards.reduce((n, c) => n + c.quantity, 0);
  return (
    <div className="field-screen game-deck" role="dialog" aria-modal="true" aria-label={whose}>
      <header className="field-header">
        <button className="icon-btn" aria-label="Back to the field" onClick={onClose}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 5l-6 6 6 6" />
          </svg>
        </button>
        <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>
            {deck.name}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            {whose} · {count} cards, as brought to this game
          </span>
        </div>
      </header>
      <div className="field-body deck-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          </div>
        </section>
        <DeckCards cards={deck.cards} />
      </div>
    </div>
  );
}
