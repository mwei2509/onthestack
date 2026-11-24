import type { SeatView } from '@onthestack/server/protocol';
import { Fragment, useState } from 'react';
import { Arrow } from '../../icons.js';
import { Avatar } from '../parts.js';
import { clockwiseFrom } from '../seats.js';

/** Start asks who won the dice; turns go clockwise from them (ADR 0051). */
export function WhoGoesFirst({ seats, colours, onCancel, onStart }: { seats: SeatView[]; colours: Record<string, string>; onCancel: () => void; onStart: (firstSeatId: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const order = picked ? clockwiseFrom(seats, picked) : seats;
  const first = seats.find((s) => s.id === picked);

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="who-first">
        <div className="handle" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 id="who-first" className="display" style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '0.02em' }}>
            Who goes first?
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>
            Roll at the table, then tap the winner. Turns go clockwise from them.
          </p>
        </div>
        <div className="pick-grid">
          {seats.map((s) => (
            <button key={s.id} className="pick" aria-pressed={picked === s.id} onClick={() => setPicked(s.id)}>
              <Avatar name={s.name} colour={colours[s.id]!} size={36} />
              {s.name}
            </button>
          ))}
        </div>
        {first && (
          <div style={{ background: 'var(--ink)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="section-label" style={{ fontSize: 12 }}>
              Turn order
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 15 }}>
              {order.map((s, i) => (
                <Fragment key={s.id}>
                  <span className={i === 0 ? 'display' : undefined} style={i === 0 ? { color: 'var(--accent)', fontWeight: 800 } : undefined}>{s.name}</span>
                  {i < order.length - 1 && <Arrow />}
                </Fragment>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ height: 56, padding: '0 20px', borderRadius: 16, fontSize: 16 }} onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" style={{ flexGrow: 1 }} disabled={!first} onClick={() => first && onStart(first.id)}>
            {first ? `Start with ${first.name}` : 'Tap who won the roll'}
          </button>
        </div>
      </section>
    </div>
  );
}
