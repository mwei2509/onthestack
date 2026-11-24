import { useState } from 'react';
import { ScreenIcon } from '../../icons.js';
import { Avatar, ConnectionPill, GameHeader, Invite, SeatDot } from '../parts.js';
import { seatColours } from '../seats.js';
import type { ScreenProps } from '../useGame.js';

const MAX_SEATS = 6;

export function JoinScreen({ code, game, update }: ScreenProps) {
  const [name, setName] = useState('');
  const colours = seatColours(update.seats);
  const full = update.seats.length >= MAX_SEATS;

  return (
    <div className="phone">
      <GameHeader code={code} right={<ConnectionPill connection={game.connection} />} />

      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) game.send({ type: 'join', name: name.trim() });
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
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="nickname" autoFocus />
            </label>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
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
                <div className="seat-main">
                  <Avatar name={seat.name} colour={colours[seat.id]!} size={36} />
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
        <Invite code={code} />
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
