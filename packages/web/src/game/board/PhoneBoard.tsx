import type { TableView } from '@onthestack/engine';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Avatar, SeatWash } from '../parts.js';
import type { ScreenProps } from '../useGame.js';
import { createTapCombiner } from './lifeTaps.js';
import { GameMenuButton } from './GameMenu.js';
import { boardPlayers, endedLine, type BoardPlayer } from './model.js';
import { LogStatus, QuestionTray, SayBar, ThisTurn } from '../log/TurnLog.js';
import { useNoteTray } from '../log/useNoteTray.js';
import { clockTime, Crest, EndedPill, HitChips, NextStepCompact, StepCard, StepMenuButton, Tag, worstHit } from './parts.js';
import { StepMenu } from './StepMenu.js';
import { FieldScreen } from '../field/FieldScreen.js';
import { useGameDecks } from '../field/gameDecks.js';

export function PhoneBoard({ code, game, update, you, view }: ScreenProps & { you: string; view: TableView }) {
  const { ended } = update;
  const players = boardPlayers(view, update.seats, ended !== null);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const me = byId[you];
  const active = byId[view.turn.activePlayerId]!;
  const online = game.connection === 'open' || ended !== null;
  const myTurn = active.id === you;
  const [menuOpen, setMenuOpen] = useState(false);
  const [fieldOf, setFieldOf] = useState<string | null>(null);
  const decks = useGameDecks(code);
  const notes = useNoteTray(update.log, view.turn.number);

  return (
    <div className="phone board">
      <header className="game-header" style={{ minHeight: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: online ? 1 : 0.6 }}>
          <Avatar name={active.name} colour={active.ring} size={32} active={!ended} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="display" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.02em' }}>
              {ended ? 'Game ended' : myTurn ? 'Your turn' : `${active.name}'s turn`}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              Turn {view.turn.number} · {code}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ended ? (
            <EndedPill />
          ) : online ? (
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
          {!ended && <GameMenuButton game={game} />}
        </div>
      </header>

      <div className="board-body" style={{ opacity: online ? 1 : 0.6 }}>
        {!ended && <StepCard view={view} />}
        {me && <YourSeat me={me} players={byId} game={game} disabled={!online} readOnly={ended !== null} large={players.length <= 2} noteDelta={notes.net[you]} onOpenField={() => setFieldOf(you)} />}
        <ul aria-label="Other players" className="others">
          {players
            .filter((p) => p.id !== you)
            .map((p) => (
              <OtherPlayer key={p.id} player={p} noteDelta={notes.net[p.id]} />
            ))}
        </ul>
        {update.log && <ThisTurn log={update.log} view={view} game={game} />}
      </div>

      {online && !ended && <QuestionTray log={update.log} view={view} you={you} game={game} notes={notes} />}
      {online && !ended && <LogStatus log={update.log} game={game} />}
      <footer className="board-dock">
        {ended ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'center' }}>
            <span className="muted" style={{ fontSize: 14 }}>
              {endedLine(ended, view, clockTime)}
            </span>
            <Link to="/">Back to start</Link>
          </div>
        ) : online ? (
          <>
            <StepMenuButton onOpen={() => setMenuOpen(true)} />
            {myTurn && <NextStepCompact view={view} onNext={() => game.send({ type: 'nextStep', from: view.turn.step })} />}
            <SayBar game={game} />
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

      {fieldOf && <FieldScreen view={view} players={players} you={you} start={fieldOf} decks={decks} game={online && !ended ? game : undefined} onClose={() => setFieldOf(null)} />}
      {menuOpen && !ended && <StepMenu view={view} game={game} confirmFirst={!myTurn} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

function YourSeat({
  me,
  players,
  game,
  disabled,
  readOnly,
  large,
  noteDelta,
  onOpenField,
}: {
  me: BoardPlayer;
  players: Record<string, BoardPlayer>;
  game: ScreenProps['game'];
  disabled: boolean;
  readOnly: boolean;
  large: boolean;
  /** The net life change from this device's open readback notes (ADR 0136). */
  noteDelta?: number;
  onOpenField: () => void;
}) {
  const [pending, setPending] = useState(0);
  const { send } = game;
  const [taps] = useState(() => createTapCombiner((delta) => send({ type: 'adjustLife', delta }), setPending));
  useEffect(() => () => taps.flush(), [taps]);
  useEffect(() => {
    // Taps not yet sent when the game ends are dropped, not sent into a refusal (ADR 0100).
    if (disabled || readOnly) taps.cancel();
  }, [disabled, readOnly, taps]);

  const life = me.life + pending;
  return (
    <section aria-label="Your seat" className={`your-seat${me.active ? ' glowing' : ''}`}>
      <SeatWash colour={me.colour} identity={me.identity} strength={55} />
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: readOnly ? 'center' : 'space-between', padding: '2px 4px' }}>
          {!readOnly && (
            <button className="life-btn" aria-label="Lose 1 life" disabled={disabled} onClick={() => taps.tap(-1)}>
              <svg width="24" height="24" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                <path d="M5 11h12" />
              </svg>
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Crest life={life} size={large ? 156 : 128} out={me.out} />
            {pending !== 0 && (
              <span className="num" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15, marginTop: -6 }}>
                {signed(pending)}
              </span>
            )}
            {pending === 0 && noteDelta !== undefined && <NoteDelta delta={noteDelta} />}
          </div>
          {!readOnly && (
            <button className="life-btn" aria-label="Gain 1 life" disabled={disabled} onClick={() => taps.tap(1)}>
              <svg width="24" height="24" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                <path d="M5 11h12M11 5v12" />
              </svg>
            </button>
          )}
        </div>
        {me.hits.some((h) => h.damage > 0) && (
          <div className="hits">
            <span className="muted" style={{ fontSize: 12 }}>
              Commander damage
            </span>
            <HitChips hits={me.hits} players={players} />
          </div>
        )}
        <button className="btn my-field" onClick={onOpenField}>
          My field
        </button>
      </div>
    </section>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

/** A life change the app applied on its own, beside the total while its note is open (ADR 0057, 0136). */
function NoteDelta({ delta }: { delta: number }) {
  return (
    <span className="num note-delta" aria-label={`${signed(delta)} from the app's notes`}>
      {signed(delta)}
    </span>
  );
}

function OtherPlayer({ player, noteDelta }: { player: BoardPlayer; noteDelta?: number }) {
  const hit = worstHit(player.hits);
  const sub = player.out ? ['Fallen', hit].filter(Boolean).join(' · ') : [player.commander, hit].filter(Boolean).join(' · ');
  return (
    <li className={`other${player.active ? ' glowing' : ''}${player.out ? ' out' : ''}`} aria-label={player.name}>
      <SeatWash colour={player.colour} identity={player.identity} strength={28} />
      <Avatar name={player.name} colour={player.ring} size={38} active={player.active} />
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
      {noteDelta !== undefined && <NoteDelta delta={noteDelta} />}
      <span className="num" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, ...(player.out ? { textDecoration: 'line-through' } : {}) }}>
        {player.life}
      </span>
    </li>
  );
}
