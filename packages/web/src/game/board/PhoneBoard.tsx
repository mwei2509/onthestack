import type { TableView } from '@onthestack/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../parts.js';
import type { ScreenProps } from '../useGame.js';
import { createTapCombiner } from './lifeTaps.js';
import { boardPlayers, type BoardPlayer } from './model.js';
import { cue, HitBar, HitChips, NextStepButton, StepCard, StepMenuButton, Tag } from './parts.js';
import { StepMenu } from './StepMenu.js';

export function PhoneBoard({ code, game, update, you, view }: ScreenProps & { you: string; view: TableView }) {
  const players = boardPlayers(view, update.seats);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const me = byId[you];
  const active = byId[view.turn.activePlayerId]!;
  const online = game.connection === 'open';
  const myTurn = active.id === you;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="phone board">
      <header className="game-header" style={{ minHeight: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: online ? 1 : 0.6 }}>
          <span className="turn-ring">
            <Avatar name={active.name} colour={active.colour} size={30} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{myTurn ? 'Your turn' : `${active.name}'s turn`}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              Turn {view.turn.number} · {code}
            </span>
          </div>
        </div>
        {online ? (
          <span className="pill" role="status" style={{ border: 0 }}>
            <span className="dot on" style={{ width: 8, height: 8 }} />
            Online
          </span>
        ) : (
          <span className="pill reconnecting" role="status">
            <span className="spinner" aria-hidden />
            Reconnecting
          </span>
        )}
      </header>

      <div className="board-body" style={{ opacity: online ? 1 : 0.6 }}>
        <StepCard view={view} />
        {me && <YourSeat me={me} players={byId} game={game} disabled={!online} large={players.length <= 2} />}
        <ul aria-label="Other players" className="others">
          {players
            .filter((p) => p.id !== you)
            .map((p) => (
              <OtherPlayer key={p.id} player={p} players={byId} />
            ))}
        </ul>
      </div>

      <footer className="board-dock">
        {online ? (
          <>
            <StepMenuButton onOpen={() => setMenuOpen(true)} />
            {myTurn && <NextStepButton view={view} onNext={() => game.send({ type: 'nextStep', from: view.turn.step })} />}
            {!myTurn && (
              <span className="faint" style={{ alignSelf: 'center', fontSize: 14 }}>
                {active.name} moves the steps on
              </span>
            )}
          </>
        ) : (
          <div className="offline-banner" role="status">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M2 8.5a13 13 0 0 1 18 0M5 12a8.5 8.5 0 0 1 12 0M8.3 15.4a4 4 0 0 1 5.4 0" />
              <path d="M3 3l16 16" />
            </svg>
            <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent-hover)' }}>Lost connection</span>
              <span style={{ fontSize: 13, color: '#CDBF9E', lineHeight: 1.35 }}>
                Showing the board as of {game.updatedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? 'your last update'}. Keep playing at the table; we'll catch up.
              </span>
            </span>
            <button className="btn" style={{ height: 44, borderColor: '#5A4A26', color: 'var(--accent-hover)' }} onClick={game.retry}>
              Retry
            </button>
          </div>
        )}
      </footer>

      {menuOpen && <StepMenu view={view} game={game} confirmFirst={!myTurn} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

function YourSeat({ me, players, game, disabled, large }: { me: BoardPlayer; players: Record<string, BoardPlayer>; game: ScreenProps['game']; disabled: boolean; large: boolean }) {
  const [pending, setPending] = useState(0);
  const sendRef = useRef(game.send);
  sendRef.current = game.send;
  const taps = useMemo(() => createTapCombiner((delta) => sendRef.current({ type: 'adjustLife', delta }), setPending), []);
  useEffect(() => () => taps.flush(), [taps]);
  useEffect(() => {
    if (disabled) taps.cancel();
  }, [disabled, taps]);

  const life = me.life + pending;
  return (
    <section aria-label="Your seat" className={`your-seat${me.active ? ' active' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={me.name} colour={me.colour} />
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{me.name}</span>
            <Tag kind="you" />
            {me.active && <Tag kind="turn" />}
          </div>
          {me.commander && <span className="muted" style={{ fontSize: 14 }}>{me.commander}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
        <button className="life-btn" aria-label="Lose 1 life" disabled={disabled} onClick={() => taps.tap(-1)}>
          <svg width="24" height="24" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M5 11h12" />
          </svg>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          <span className="num" aria-live="polite" style={{ fontSize: large ? 112 : 76, fontWeight: 600, lineHeight: large ? 0.95 : 1, textDecoration: me.out ? 'line-through' : undefined }}>
            {life}
          </span>
          <span className="faint" style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {pending !== 0 ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{pending > 0 ? `+${pending}` : `−${-pending}`}</span> : 'Life'}
          </span>
        </div>
        <button className="life-btn" aria-label="Gain 1 life" disabled={disabled} onClick={() => taps.tap(1)}>
          <svg width="24" height="24" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M5 11h12M11 5v12" />
          </svg>
        </button>
      </div>
      {me.hits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="faint" style={{ fontSize: 12 }}>
            Commander damage taken
          </span>
          <div className="hit-grid">
            {me.hits.map((h) => (
              <div key={h.fromId} className="hit">
                <Avatar name={players[h.fromId]!.name} colour={players[h.fromId]!.colour} size={24} />
                <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="seat-sub" style={{ fontSize: 12 }}>{h.commander}</span>
                  <HitBar damage={h.damage} />
                </span>
                <span className="num" style={{ fontSize: 20, fontWeight: 600, color: cue(h.damage) }}>
                  {h.damage}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function OtherPlayer({ player, players }: { player: BoardPlayer; players: Record<string, BoardPlayer> }) {
  return (
    <li className={`other${player.active ? ' active' : ''}${player.out ? ' out' : ''}`} aria-label={player.name}>
      <span className={player.active ? 'turn-ring small' : undefined}>
        <Avatar name={player.name} colour={player.colour} size={36} />
      </span>
      <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{player.name}</span>
          <span className={`dot ${player.connected ? 'on' : 'off'}`} style={{ width: 8, height: 8 }} role="img" aria-label={player.connected ? 'Connected' : 'No device'} />
          {player.active && <Tag kind="turn" />}
        </div>
        {player.out ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>Out</span> : player.hits.length > 0 && <HitChips hits={player.hits} players={players} />}
      </div>
      <span className="num" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1, ...(player.out ? { textDecoration: 'line-through', color: 'var(--text-3)' } : {}) }}>
        {player.life}
      </span>
    </li>
  );
}
