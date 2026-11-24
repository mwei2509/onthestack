import { Logo } from '../../icons.js';
import { Avatar, ConnectionPill, gameLink, SeatDot } from '../parts.js';
import { seatColours } from '../seats.js';
import type { ScreenProps } from '../useGame.js';
import { useState } from 'react';
import type { SeatView } from '@onthestack/server/protocol';
import { WhoGoesFirst } from './WhoGoesFirst.js';

/**
 * The lobby on a Shared screen: the code to join with and the seats around the table, clockwise from the top left
 * (the bottom row runs right to left).
 */
export function SharedLobby({ code, game, update }: ScreenProps) {
  const colours = seatColours(update.seats);
  const [choosingFirst, setChoosingFirst] = useState(false);
  const half = Math.ceil(update.seats.length / 2);
  const top = update.seats.slice(0, half);
  const bottom = update.seats.slice(half).reverse();
  const link = gameLink(code).replace(/^https?:\/\//, '');

  return (
    <div className="shared">
      <header className="game-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Logo size={30} />
          <span className="display" style={{ fontSize: 22, fontWeight: 600 }}>
            On The Stack
          </span>
          <span className="pill" style={{ fontSize: 14 }}>
            Watching
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ConnectionPill connection={game.connection} />
          <button className="btn" onClick={game.stopWatching}>
            Take a seat instead
          </button>
        </div>
      </header>

      <main className="shared-main">
        <section className="join-panel">
          <h2 className="display" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
            Join on your phone
          </h2>
          <span className="muted" style={{ fontSize: 15 }}>
            {link.slice(0, link.length - code.length)}
          </span>
          <span className="big-code">{code}</span>
          <p className="faint" style={{ margin: 0, fontSize: 14, lineHeight: 1.4 }}>
            Phone died? Open the link again and tap “That's me”.
          </p>
        </section>

        <section className="shared-table">
          <SeatRow seats={top} colours={colours} />
          <div className="table-oval">
            <p className="faint" style={{ margin: 0, fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Clockwise · {update.seats.length} {update.seats.length === 1 ? 'player' : 'players'} · 40 life
            </p>
            <button className="btn btn-primary" style={{ height: 64, padding: '0 40px', fontSize: 20 }} disabled={update.seats.length === 0} onClick={() => setChoosingFirst(true)}>
              Start game
            </button>
          </div>
          <SeatRow seats={bottom} colours={colours} />
        </section>
      </main>

      {choosingFirst && (
        <WhoGoesFirst seats={update.seats} colours={colours} onCancel={() => setChoosingFirst(false)} onStart={(firstSeatId) => game.send({ type: 'start', firstSeatId })} />
      )}
    </div>
  );
}

function SeatRow({ seats, colours }: { seats: SeatView[]; colours: Record<string, string> }) {
  if (seats.length === 0) return <div className="shared-row" />;
  return (
    <div className="shared-row">
      {seats.map((s) => (
        <div key={s.id} className="shared-seat">
          <Avatar name={s.name} colour={colours[s.id]!} size={48} />
          <span style={{ fontSize: 20, fontWeight: 600, flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
          <SeatDot seat={s} />
        </div>
      ))}
    </div>
  );
}
