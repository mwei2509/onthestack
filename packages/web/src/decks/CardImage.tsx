import { useState } from 'react';
import type { DeckCard } from './api.js';
import type { CardGroupView } from './groups.js';
import { Sheet } from './parts.js';

const imageUrl = (card: Pick<DeckCard, 'scryfallId'>, back = false) => `/api/images/${card.scryfallId}${back ? '/back' : ''}`;

/**
 * A card's image at its printed proportions, so the page doesn't jump as images arrive. Images load as they scroll
 * into view: a new Deck's first look fills each image from Scryfall once (ADR 0071). One that can't load shows the
 * card's name instead.
 */
export function CardImage({ card, back = false, eager = false }: { card: DeckCard; back?: boolean; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="card-image missing" role="img" aria-label={card.name}>
        <span className="display">{card.name}</span>
      </span>
    );
  }
  return (
    <img
      className="card-image"
      src={imageUrl(card, back)}
      alt={back ? `${card.name}, back face` : card.name}
      width={488}
      height={680}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** The Cards view: every type group's cards as images, in the same order as the list (ADR 0088). */
export function CardGrid({ groups, onOpen }: { groups: CardGroupView[]; onOpen: (card: DeckCard) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map((g) => (
        <section key={g.group} aria-label={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 className="card-grid-heading">
            <span className="display">{g.label}</span>
            <span className="count muted">{g.count}</span>
          </h3>
          <ul className="card-grid">
            {g.cards.map((c) => (
              <li key={c.scryfallId + c.name}>
                <button className={`card-tile${c.commander ? ' commander' : ''}`} onClick={() => onOpen(c)} aria-label={`${c.name}${c.quantity > 1 ? `, ${c.quantity} copies` : ''}`}>
                  <CardImage card={c} />
                  {c.quantity > 1 && <span className="card-qty count">×{c.quantity}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** One card, large, with Flip for a double-faced card. */
export function CardSheet({ card, onClose }: { card: DeckCard; onClose: () => void }) {
  const [back, setBack] = useState(false);
  return (
    <Sheet title={card.name} onClose={onClose}>
      <div className="card-sheet-image">
        <CardImage key={back ? 'back' : 'front'} card={card} back={back} eager />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44 }}>
        <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
          <span>
            <span className="count" style={{ color: 'var(--text)' }}>
              {card.quantity}
            </span>{' '}
            {card.quantity === 1 ? 'copy' : 'copies'}
          </span>
          {card.commander && <span className="commander-tag">Commander</span>}
        </span>
        {card.doubleFaced && (
          <button className="btn" style={{ height: 44 }} aria-pressed={back} onClick={() => setBack(!back)}>
            {back ? 'Show front' : 'Flip'}
          </button>
        )}
      </div>
    </Sheet>
  );
}
