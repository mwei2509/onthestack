import type { TableView } from '@onthestack/engine';
import { useEffect, useState } from 'react';
import { Avatar, SeatWash } from '../parts.js';
import type { ScreenProps } from '../useGame.js';
import { createTapCombiner } from './lifeTaps.js';
import { boardPlayers, type BoardPlayer } from './model.js';
import { Crest, HitChips, NextStepButton, StepCard, StepMenuButton, Tag, worstHit } from './parts.js';
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
          <Avatar name={active.name} colour={active.colour} size={32} active />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="display" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.02em' }}>
              {myTurn ? 'Your turn' : `${active.name}'s turn`}
            </span>
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
              <OtherPlayer key={p.id} player={p} />
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
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="var(--accent-hover)" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M2 8.5a13 13 0 0 1 18 0M5 12a8.5 8.5 0 0 1 12 0M8.3 15.4a4 4 0 0 1 5.4 0" />
              <path d="M3 3l16 16" />
            </svg>
            <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-hover)' }}>
                Lost connection
              </span>
              <span style={{ fontSize: 13, color: '#D9C9A6', lineHeight: 1.35 }}>
                Showing the board as of {game.updatedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? 'your last update'}. Keep playing at the table; we'll catch up.
              </span>
            </span>
            <button className="btn" style={{ height: 44, boxShadow: 'inset 0 0 0 1px #5A4A26', background: 'transparent', color: 'var(--accent-hover)' }} onClick={game.retry}>
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
  const { send } = game;
  const [taps] = useState(() => createTapCombiner((delta) => send({ type: 'adjustLife', delta }), setPending));
  useEffect(() => () => taps.flush(), [taps]);
  useEffect(() => {
    if (disabled) taps.cancel();
  }, [disabled, taps]);

  const life = me.life + pending;
  return (
    <section aria-label="Your seat" className={`your-seat${me.active ? ' glowing' : ''}`}>
      <SeatWash colour={me.colour} strength={55} />
      <div className="your-seat-body">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="display" style={{ fontSize: large ? 22 : 20, fontWeight: 800, letterSpacing: '0.03em' }}>
              {me.name}
            </span>
            <Tag kind="you" />
            {me.active && <Tag kind="your turn" />}
          </div>
          {me.commander && <span className="seat-sub" style={{ fontSize: 14 }}>{me.commander}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px' }}>
          <button className="life-btn" aria-label="Lose 1 life" disabled={disabled} onClick={() => taps.tap(-1)}>
            <svg width="24" height="24" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M5 11h12" />
            </svg>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Crest life={life} size={large ? 156 : 128} out={me.out} />
            {pending !== 0 && (
              <span className="num" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15, marginTop: -6 }}>
                {pending > 0 ? `+${pending}` : `−${-pending}`}
              </span>
            )}
          </div>
          <button className="life-btn" aria-label="Gain 1 life" disabled={disabled} onClick={() => taps.tap(1)}>
            <svg width="24" height="24" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M5 11h12M11 5v12" />
            </svg>
          </button>
        </div>
        {me.hits.some((h) => h.damage > 0) && (
          <div className="hits">
            <span className="muted" style={{ fontSize: 12 }}>
              Commander damage
            </span>
            <HitChips hits={me.hits} players={players} />
          </div>
        )}
      </div>
    </section>
  );
}

function OtherPlayer({ player }: { player: BoardPlayer }) {
  const hit = worstHit(player.hits);
  const sub = player.out ? ['Fallen', hit].filter(Boolean).join(' · ') : [player.commander, hit].filter(Boolean).join(' · ');
  return (
    <li className={`other${player.active ? ' glowing' : ''}${player.out ? ' out' : ''}`} aria-label={player.name}>
      <SeatWash colour={player.colour} strength={28} />
      <Avatar name={player.name} colour={player.colour} size={38} active={player.active} />
      <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="display" style={{ fontSize: 16, fontWeight: 700 }}>
            {player.name}
          </span>
          {!player.connected && <span className="muted" style={{ fontSize: 11 }}>· no device</span>}
        </div>
        {sub && (
          <span className="seat-sub" style={{ fontSize: 12, ...(player.out ? { color: 'var(--danger)', fontStyle: 'normal', fontWeight: 600 } : {}) }}>
            {sub}
          </span>
        )}
      </div>
      <span className="num" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, ...(player.out ? { textDecoration: 'line-through' } : {}) }}>
        {player.life}
      </span>
    </li>
  );
}
