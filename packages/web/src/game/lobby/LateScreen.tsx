import { ScreenIcon } from '../../icons.js';
import { Avatar, GameHeader, SeatWash } from '../parts.js';
import { seatColours } from '../seats.js';
import type { ScreenProps } from '../useGame.js';
import { ThatsMe } from './JoinScreen.js';

/** A device opening a game that has started: it can only take an existing seat or watch (ADR 0051). */
export function LateScreen({ code, game, update }: ScreenProps) {
  const colours = seatColours(update.seats);
  const turn = update.view?.turn.number;
  return (
    <div className="phone" style={{ gap: 18 }}>
      <GameHeader
        code={code}
        right={
          <span className="pill display" style={{ color: 'var(--accent)', borderColor: 'var(--gold-line)', fontWeight: 700 }}>
            In progress{turn ? ` · Turn ${turn}` : ''}
          </span>
        }
      />
      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 className="title">Already playing?</h1>
        <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>
          Tap your seat to pick up where your phone left off.
        </p>
      </section>
      <ol className="seat-list" style={{ gap: 6 }}>
        {update.seats.map((seat) => (
          <li key={seat.id} className={`seat-row${seat.connected ? '' : ' waiting'}`} style={{ padding: '8px 8px 8px 12px' }}>
            <SeatWash colour={colours[seat.id]!} />
            <div className="seat-main" style={{ gap: 12 }}>
              <Avatar name={seat.name} colour={colours[seat.id]!} size={36} />
              <div className="seat-text">
                <span className="seat-name" style={{ fontSize: 16 }}>{seat.name}</span>
                <span className="seat-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`dot ${seat.connected ? 'on' : 'off'}`} style={{ width: 8, height: 8 }} />
                  {seat.connected ? 'Connected on another phone' : 'Phone disconnected'}
                </span>
              </div>
              <ThatsMe game={game} seatId={seat.id} connected={seat.connected} name={seat.name} primary />
            </div>
          </li>
        ))}
      </ol>
      <section style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="faint" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span style={{ flexGrow: 1, height: 1, background: 'var(--line)' }} />
          or
          <span style={{ flexGrow: 1, height: 1, background: 'var(--line)' }} />
        </div>
        <button className="btn btn-raised" style={{ height: 60, justifyContent: 'flex-start', gap: 14, textAlign: 'left' }} onClick={game.watch}>
          <ScreenIcon size={24} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="display" style={{ fontSize: 17 }}>Just watching</span>
            <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>Show the whole board, e.g. on a shared screen</span>
          </span>
        </button>
      </section>
    </div>
  );
}
