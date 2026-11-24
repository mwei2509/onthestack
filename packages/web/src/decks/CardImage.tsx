import { useEffect, useRef, useState } from 'react';
import { Back, Close, Forward } from '../icons.js';
import type { DeckCard } from './api.js';
import type { CardGroupView } from './groups.js';
import { ManaCost } from './identity.js';

const imageUrl = (card: Pick<DeckCard, 'scryfallId'>, back = false) => `/api/images/${card.scryfallId}${back ? '/back' : ''}`;

const sameCard = (a: DeckCard | null, b: DeckCard) => a !== null && a.scryfallId === b.scryfallId && a.name === b.name;

/**
 * A card's image at its printed proportions, so the page doesn't jump as images arrive. Images load as they scroll
 * into view: a new Deck's first look fills each image from Scryfall once (ADR 0071). One that can't load is drawn in
 * the canvas's frame instead: name, cost and type line (ADR 0096).
 */
export function CardImage({ card, back = false, eager = false }: { card: DeckCard; back?: boolean; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="card-image missing" role="img" aria-label={card.name}>
        <span className="card-frame-top">
          <span className="display card-frame-name">{card.name}</span>
          <ManaCost cost={card.manaCost} size={12} />
        </span>
        <span className="card-frame-art" aria-hidden />
        <span className="card-frame-type">{card.typeLine}</span>
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

/** The Cards view: each section's cards as images, in the same order as the list (ADR 0096, 0099). */
export function CardGrid({ groups, selected, onOpen }: { groups: CardGroupView[]; selected: DeckCard | null; onOpen: (card: DeckCard) => void }) {
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
                <button
                  className={`card-tile${c.commander ? ' commander' : ''}`}
                  onClick={() => onOpen(c)}
                  aria-pressed={sameCard(selected, c)}
                  aria-label={`${c.name}${c.quantity > 1 ? `, ${c.quantity} copies` : ''}`}
                >
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

/**
 * One card opened: large, with its Oracle text, mana value, copies and whether the app knows it (ADR 0096, 0098).
 * Key it by card so Flip starts on the front each time.
 */
export function CardDetail({ card, onStep }: { card: DeckCard; onStep: (step: 1 | -1) => void }) {
  const [back, setBack] = useState(false);
  return (
    <div className="card-detail">
      <div className="card-detail-stage">
        <button className="icon-btn" aria-label="Previous card" onClick={() => onStep(-1)}>
          <Back />
        </button>
        <div className={`card-detail-image${card.commander ? ' commander' : ''}`}>
          <CardImage key={back ? 'back' : 'front'} card={card} back={back} eager />
        </div>
        <button className="icon-btn" aria-label="Next card" onClick={() => onStep(1)}>
          <Forward />
        </button>
      </div>
      <div className="card-detail-text">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 className="display" style={{ margin: 0, fontSize: 19, fontWeight: 800, flexGrow: 1 }}>
            {card.name}
          </h2>
          {card.doubleFaced && (
            <button className="btn" style={{ height: 40 }} aria-pressed={back} onClick={() => setBack(!back)}>
              {back ? 'Show front' : 'Flip'}
            </button>
          )}
        </div>
        {card.oracleText && <p className="oracle-text">{card.oracleText}</p>}
        <div className="card-facts">
          <span>
            Mana value <span className="count fact">{card.manaValue}</span>
          </span>
          <span>
            In this deck <span className="count fact">×{card.quantity}</span>
          </span>
          {card.commander && <span className="commander-tag">Commander</span>}
        </div>
        <span className={`known-tag ${card.known ? 'known' : 'unknown'}`}>
          {card.known ? 'The app knows how this card works' : 'Not taught yet — the app will ask you when it matters'}
        </span>
      </div>
    </div>
  );
}

/** A phone's opened card, covering the page (ADR 0096). Arrow keys step through the cards and Escape closes it. */
export function CardOverlay({ card, onStep, onClose }: { card: DeckCard; onStep: (step: 1 | -1) => void; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  return (
    <div
      className="card-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft') onStep(-1);
        if (e.key === 'ArrowRight') onStep(1);
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button ref={close} className="icon-btn card-overlay-close" aria-label="Close" onClick={onClose}>
          <Close />
        </button>
      </div>
      <CardDetail key={card.scryfallId + card.name} card={card} onStep={onStep} />
    </div>
  );
}
