import type { SeatView } from '@onthestack/server/protocol';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { EditIcon, Grip, ShareIcon } from '../../icons.js';
import { Avatar, gameLink, Invite, GameHeader, SeatDot, SeatWash } from '../parts.js';
import { moved, seatColours } from '../seats.js';
import type { ScreenProps } from '../useGame.js';
import { WhoGoesFirst } from './WhoGoesFirst.js';

export function LobbyScreen({ code, game, update, you }: ScreenProps & { you: string }) {
  const colours = seatColours(update.seats);
  const [editing, setEditing] = useState<string | null>(null);
  const [choosingFirst, setChoosingFirst] = useState(false);
  const drag = useSeatDrag(update.seats, (seatIds) => game.send({ type: 'reorder', seatIds }));
  const seats = drag.order.map((id) => update.seats.find((s) => s.id === id)!).filter(Boolean);

  const share = () => {
    const url = gameLink(code);
    if (typeof navigator.share === 'function') void navigator.share({ title: 'Join my game on On The Stack', url }).catch(() => undefined);
    else void navigator.clipboard?.writeText(url);
  };

  return (
    <div className="phone">
      <GameHeader
        code={code}
        right={
          <button className="btn" style={{ height: 44 }} onClick={share}>
            <ShareIcon />
            Invite
          </button>
        }
      />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 className="title">Seats</h1>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
          Clockwise around the table. Drag to match how you're sitting.
        </p>
      </section>

      <ol className="seat-list" ref={drag.listRef}>
        {seats.map((seat, i) => (
          <SeatRow
            key={seat.id}
            seat={seat}
            colour={colours[seat.id]!}
            you={seat.id === you}
            dragging={drag.dragging === seat.id}
            editing={editing === seat.id}
            onEdit={() => setEditing(seat.id)}
            onDone={() => setEditing(null)}
            game={game}
            grip={{
              onPointerDown: (e) => drag.start(e, seat.id),
              onKeyDown: (e) => drag.key(e, seat.id, i),
            }}
          />
        ))}
      </ol>

      {seats.length < 2 && <Invite code={code} note="Up to 6 seats" />}

      <footer style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="faint" style={{ margin: 0, fontSize: 14, textAlign: 'center' }}>
          {seats.length} {seats.length === 1 ? 'player' : 'players'} · 40 life each · anyone can start
        </p>
        <button className="btn btn-primary" style={{ height: 60, fontSize: 18 }} onClick={() => setChoosingFirst(true)}>
          Start game
        </button>
      </footer>

      {choosingFirst && (
        <WhoGoesFirst
          seats={update.seats}
          colours={colours}
          onCancel={() => setChoosingFirst(false)}
          onStart={(firstSeatId) => game.send({ type: 'start', firstSeatId })}
        />
      )}
    </div>
  );
}

interface SeatRowProps {
  seat: SeatView;
  colour: string;
  you: boolean;
  dragging: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  game: ScreenProps['game'];
  grip: { onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void; onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void };
}

function SeatRow({ seat, colour, you, dragging, editing, onEdit, onDone, game, grip }: SeatRowProps) {
  const [name, setName] = useState(seat.name);
  const classes = ['seat-row', you && 'you', editing && 'editing', dragging && 'dragging'].filter(Boolean).join(' ');

  const done = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== seat.name) game.send({ type: 'editSeat', seatId: seat.id, name: trimmed });
    onDone();
  };

  return (
    <li className={classes} data-seat={seat.id}>
      <SeatWash colour={colour} />
      <div className="seat-main">
        <button className="grip" aria-label={`Move ${seat.name}. Drag, or use the arrow keys`} {...grip}>
          <Grip />
        </button>
        <Avatar name={seat.name} colour={colour} />
        <div className="seat-text">
          <span className="seat-name">
            {seat.name}
            {you && <span className="you-tag">YOU</span>}
          </span>
          {!seat.deckId && <span className="seat-sub">No deck</span>}
        </div>
        <SeatDot seat={seat} />
        {!editing && (
          <button className="icon-btn" aria-label={`Edit ${seat.name}'s seat`} onClick={onEdit}>
            <EditIcon />
          </button>
        )}
      </div>
      {editing && (
        <form
          className="seat-edit"
          onSubmit={(e) => {
            e.preventDefault();
            done();
          }}
        >
          {!seat.connected && (
            <p className="muted" style={{ margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="dot off" style={{ width: 8, height: 8 }} />
              No device connected
            </p>
          )}
          <label className="field" style={{ fontSize: 13 }}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} style={{ height: 44, fontSize: 16, background: 'var(--ink)' }} autoFocus />
          </label>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" className="btn btn-text" style={{ color: 'var(--danger)' }} onClick={() => game.send({ type: 'removeSeat', seatId: seat.id })}>
              Remove seat
            </button>
            <button type="submit" className="btn btn-light" style={{ height: 44, padding: '0 20px' }}>
              Done
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

/** Drag a seat by its grip (pointer events, so it works with touch), or move it with the arrow keys. */
function useSeatDrag(seats: SeatView[], commit: (seatIds: string[]) => void) {
  const listRef = useRef<HTMLOListElement>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const ids = seats.map((s) => s.id);
  const order = dragOrder && dragOrder.length === ids.length && ids.every((id) => dragOrder.includes(id)) ? dragOrder : ids;
  const serverOrder = ids.join();

  useEffect(() => setDragOrder(null), [serverOrder]);

  const indexAt = (y: number, id: string) => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-seat]') ?? [])].filter((r) => r.dataset.seat !== id);
    return rows.filter((r) => {
      const box = r.getBoundingClientRect();
      return y > box.top + box.height / 2;
    }).length;
  };

  const start = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    let current = ids;
    setDragging(id);
    setDragOrder(ids);
    const move = (ev: globalThis.PointerEvent) => {
      current = moved(current, id, indexAt(ev.clientY, id));
      setDragOrder(current);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      setDragging(null);
      if (current.join() !== ids.join()) commit(current);
      else setDragOrder(null);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  const key = (e: KeyboardEvent<HTMLButtonElement>, id: string, index: number) => {
    const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : null;
    if (to === null || to < 0 || to >= ids.length) return;
    e.preventDefault();
    const next = moved(order, id, to);
    setDragOrder(next);
    commit(next);
  };

  return { listRef, order, dragging, start, key };
}
