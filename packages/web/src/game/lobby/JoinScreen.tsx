import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getDeck } from '../../decks/api.js';
import { ScreenIcon } from '../../icons.js';
import { Avatar, ConnectionPill, GameHeader, Invite, SeatDot, SeatWash } from '../parts.js';
import { seatLooks } from '../seats.js';
import type { ScreenProps } from '../useGame.js';
import { DeckPicker, type SeatDeck } from './DeckPicker.js';

const MAX_SEATS = 6;

// The name typed so far, kept across a trip to import a Deck and back (ADR 0087).
const draftKey = (code: string) => `join-name:${code}`;
const readDraft = (code: string) => {
  try {
    return sessionStorage.getItem(draftKey(code)) ?? '';
  } catch {
    return '';
  }
};
const saveDraft = (code: string, name: string) => {
  try {
    sessionStorage.setItem(draftKey(code), name);
  } catch {
    // Without storage the name is simply typed again after an import.
  }
};

export function JoinScreen({ code, game, update }: ScreenProps) {
  const [name, setName] = useState(() => readDraft(code));
  const [deck, setDeck] = useState<SeatDeck | null>(null);
  const [params] = useSearchParams();
  const importedId = params.get('deck');

  useEffect(() => {
    if (!importedId) return;
    getDeck(importedId).then(
      (d) =>
        setDeck({
          id: d.id,
          name: d.name,
          commanders: d.cards.filter((c) => c.commander).map((c) => c.name),
          colorIdentity: d.colorIdentity,
        }),
      () => undefined,
    );
  }, [importedId]);

  const looks = seatLooks(update.seats);
  const full = update.seats.length >= MAX_SEATS;

  return (
    <div className="phone">
      <GameHeader code={code} right={<ConnectionPill connection={game.connection} />} />

      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && deck) game.send({ type: 'join', name: name.trim(), deckId: deck.id });
        }}
      >
        <h1 className="title">Join the game</h1>
        {full ? (
          <p className="muted" style={{ margin: 0 }}>
            All {MAX_SEATS} seats are taken. If one of them is yours, tap “That's me”.
          </p>
        ) : (
          <>
            <label className="field">
              Your name
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  saveDraft(code, e.target.value);
                }}
                maxLength={24}
                autoComplete="nickname"
                autoFocus
              />
            </label>
            <DeckPicker deck={deck} code={code} onPick={setDeck} />
            <button type="submit" className="btn btn-primary" disabled={!name.trim() || !deck}>
              Take a seat
            </button>
          </>
        )}
        <button type="button" className="btn" onClick={game.watch}>
          <ScreenIcon />
          Just watching <span className="faint" style={{ fontWeight: 400 }}>· for a shared screen</span>
        </button>
      </form>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="section-label">Seats</h2>
        {update.seats.length === 0 ? (
          <div className="empty-seats">
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px dashed var(--line-3)', flexShrink: 0 }} />
            <p>Nobody's here yet. You'll be the first seat; others appear in the order you're sitting.</p>
          </div>
        ) : (
          <ol className="seat-list">
            {update.seats.map((seat) => (
              <li key={seat.id} className="seat-row" style={{ padding: '6px 8px 6px 12px' }}>
                <SeatWash colour={looks[seat.id]!.colour} identity={looks[seat.id]!.identity} />
                <div className="seat-main">
                  <Avatar name={seat.name} colour={looks[seat.id]!.ring} size={36} />
                  <div className="seat-text">
                    <span className="seat-name">{seat.name}</span>
                  </div>
                  <SeatDot seat={seat} />
                  <ThatsMe game={game} seatId={seat.id} connected={seat.connected} name={seat.name} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div style={{ marginTop: 'auto' }}>
        <Invite code={code} joinCode={update.joinCode} />
      </div>
    </div>
  );
}

/** "That's me" (ADR 0053): takes a seat with no device straight away, and one still connected after a confirm. */
export function ThatsMe({ game, seatId, connected, name, primary }: { game: ScreenProps['game']; seatId: string; connected: boolean; name: string; primary?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const take = () => game.send({ type: 'claim', seatId, takeOver: true });
  if (confirming) {
    return (
      <div role="group" aria-label={`Move ${name}'s seat to this phone?`} style={{ display: 'flex', gap: 6 }}>
        <button className="btn" style={{ height: 44, padding: '0 10px' }} onClick={() => setConfirming(false)}>
          Cancel
        </button>
        <button className="btn btn-primary" style={{ height: 44, fontSize: 14, padding: '0 12px' }} onClick={take}>
          Move here
        </button>
      </div>
    );
  }
  return (
    <button
      className={primary && !connected ? 'btn btn-primary' : 'btn'}
      style={{ height: 44, fontSize: 14, padding: '0 14px', flexShrink: 0, ...(connected ? { color: 'var(--text-2)' } : {}) }}
      onClick={() => (connected ? setConfirming(true) : take())}
    >
      That's me
    </button>
  );
}
