import type { TableView } from '@onthestack/engine';
import { useState, type CSSProperties } from 'react';
import { Logo } from '../../icons.js';
import { Avatar, SeatWash } from '../parts.js';
import { formatJoinCode } from '../joinCode.js';
import type { ScreenProps } from '../useGame.js';
import { boardPlayers, type BoardPlayer } from './model.js';
import { cue, NextStepButton, StepMenuButton, StepStrip, Tag, worstHit } from './parts.js';
import { StepMenu } from './StepMenu.js';

/** The board on a Shared screen: every seat around the table, clockwise from the top left, with the step controls. */
export function SharedBoard({ code, game, update, view }: ScreenProps & { view: TableView }) {
  const players = boardPlayers(view, update.seats);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const seatOrder = update.seats.map((s) => byId[s.id]).filter((p): p is BoardPlayer => p !== undefined);
  const half = Math.ceil(seatOrder.length / 2);
  const top = seatOrder.slice(0, half);
  const bottom = seatOrder.slice(half).reverse();
  const active = byId[view.turn.activePlayerId]!;
  const online = game.connection === 'open';
  const rowStyle = { opacity: online ? 1 : 0.6, '--cols': Math.max(1, top.length) } as CSSProperties;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="shared shared-board">
      <header className="game-header" style={{ minHeight: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo size={26} />
          <span className="display" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.04em' }}>
            On The Stack
          </span>
          <span className="faint" style={{ fontSize: 14, marginLeft: 8 }}>
            {update.joinCode ? `Join ${formatJoinCode(update.joinCode)}` : code}
          </span>
        </div>
        {online ? (
          <span className="pill" role="status" style={{ border: 0 }}>
            <span className="dot on" style={{ width: 10, height: 10 }} />
            Online
          </span>
        ) : (
          <span className="pill reconnecting" role="status">
            <span className="spinner" aria-hidden />
            Reconnecting
            <button className="btn btn-text" style={{ height: 28, color: 'var(--accent-hover)' }} onClick={game.retry}>
              Retry
            </button>
          </span>
        )}
      </header>

      <div className="shared-seats" style={rowStyle}>
        {top.map((p) => (
          <SeatCard key={p.id} player={p} players={byId} />
        ))}
      </div>

      <section aria-label="Turn and step" className="turn-strip">
        <div className="turn-who">
          <span className="faint" style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Turn {view.turn.number}
          </span>
          <span className="display" style={{ fontSize: 26, fontWeight: 800 }}>
            {active.name}'s turn
          </span>
        </div>
        <StepStrip view={view} />
        <div className="turn-controls">
          <StepMenuButton onOpen={() => setMenuOpen(true)} disabled={!online} />
          <NextStepButton view={view} disabled={!online} onNext={() => game.send({ type: 'nextStep', from: view.turn.step })} />
        </div>
      </section>

      <div className="shared-seats" style={rowStyle}>
        {bottom.map((p) => (
          <SeatCard key={p.id} player={p} players={byId} />
        ))}
      </div>

      {menuOpen && <StepMenu view={view} game={game} confirmFirst={false} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

function SeatCard({ player, players }: { player: BoardPlayer; players: Record<string, BoardPlayer> }) {
  const hit = worstHit(player.hits);
  return (
    <section aria-label={player.name} className={`seat-card${player.active ? ' glowing' : ''}${player.out ? ' out' : ''}`}>
      <SeatWash colour={player.colour} identity={player.identity} strength={28} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={player.name} colour={player.ring} size={40} active={player.active} />
        <span className="display" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.03em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.name}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {player.active && <Tag kind="their turn" />}
          {!player.connected && <span className="muted" style={{ fontSize: 12 }}>no device</span>}
        </span>
      </div>
      {player.commander && <span className="seat-sub" style={{ fontSize: 14 }}>{player.commander}</span>}
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span className="num seat-life" style={player.out ? { textDecoration: 'line-through', textDecorationThickness: 6 } : undefined}>
          {player.life}
        </span>
        {player.out && (
          <span className="display" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--danger)', textTransform: 'uppercase' }}>
            {['Fallen', hit].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      {player.hits.length > 0 && (
        <div className="hit-row">
          {player.hits.map((h) => (
            <span key={h.fromId} className="hit-box" style={h.damage === 0 ? { opacity: 0.4 } : undefined} aria-label={`${h.damage} from ${h.commander}`}>
              <Avatar name={players[h.fromId]!.name} colour={players[h.fromId]!.ring} size={20} />
              <span className="num" style={{ fontSize: 18, fontWeight: 700, color: cue(h.damage) }}>
                {h.damage}
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
