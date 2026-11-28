import type { TableView } from '@onthestack/engine';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../icons.js';
import { Avatar, SeatWash } from '../parts.js';
import { formatJoinCode } from '../joinCode.js';
import type { ScreenProps } from '../useGame.js';
import { GameMenuButton } from './GameMenu.js';
import { boardPlayers, endedLine, type BoardPlayer } from './model.js';
import { clockTime, cue, EndedPill, NextStepButton, StepMenuButton, StepStrip, Tag, worstHit } from './parts.js';
import { StepMenu } from './StepMenu.js';
import { STEP_NAMES } from './steps.js';
import { NoteCard, SayFor, TurnLogList } from '../log/TurnLog.js';
import { noteSpeaker } from '../log/notes.js';
import { useNoteTray } from '../log/useNoteTray.js';
import { FieldScreen } from '../field/FieldScreen.js';
import { useGameDecks, type GameDecks } from '../field/gameDecks.js';
import { GameDeckView } from '../field/GameDeckView.js';

/** The board on a Shared screen: every seat around the table, clockwise from the top left, with the step controls. */
export function SharedBoard({ code, game, update, view }: ScreenProps & { view: TableView }) {
  const { ended } = update;
  const players = boardPlayers(view, update.seats, ended !== null);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const seatOrder = update.seats.map((s) => byId[s.id]).filter((p): p is BoardPlayer => p !== undefined);
  const half = Math.ceil(seatOrder.length / 2);
  const top = seatOrder.slice(0, half);
  const bottom = seatOrder.slice(half).reverse();
  const active = byId[view.turn.activePlayerId]!;
  const online = game.connection === 'open' || ended !== null;
  const rowStyle = { opacity: online ? 1 : 0.6, '--cols': Math.max(1, top.length) } as CSSProperties;
  const [menuOpen, setMenuOpen] = useState(false);
  const [fieldOf, setFieldOf] = useState<string | null>(null);
  const [deckOf, setDeckOf] = useState<string | null>(null);
  const decks = useGameDecks(code);
  const open = { field: setFieldOf, deck: setDeckOf, decks };
  const notes = useNoteTray(update.log, view.turn.number);

  const deckView = (seatId: string) => {
    const deck = decks?.decks.find((d) => d.seatId === seatId);
    return deck ? <GameDeckView deck={deck} whose={`${byId[seatId]?.name ?? 'Their'}'s Deck`} onClose={() => setDeckOf(null)} /> : null;
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ended ? (
            <EndedPill />
          ) : online ? (
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
          {!ended && <GameMenuButton game={game} />}
        </div>
      </header>

      <div className="shared-body">
        <div className="shared-table-col">
          <div className="shared-seats" style={rowStyle}>
            {top.map((p) => (
              <SeatCard key={p.id} player={p} players={byId} game={ended ? undefined : game} disabled={!online} open={open} noteDelta={notes.net[p.id]} />
            ))}
          </div>

          {ended ? (
            <section aria-label="Game over" className="turn-strip">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="display" style={{ fontSize: 26, fontWeight: 800 }}>
                  Game over · Turn {view.turn.number}
                </span>
                <span className="muted" style={{ fontSize: 14 }}>
                  {endedLine(ended, view, clockTime)}
                </span>
                <Link to="/">Back to start</Link>
              </div>
            </section>
          ) : (
            <section aria-label="Turn and step" className="turn-strip">
              <div className="turn-who">
                <span className="faint" style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  Turn {view.turn.number} · <span style={{ color: 'var(--accent)' }}>{STEP_NAMES[view.turn.step]}</span>
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
          )}

          <div className="shared-seats" style={rowStyle}>
            {bottom.map((p) => (
              <SeatCard key={p.id} player={p} players={byId} game={ended ? undefined : game} disabled={!online} open={open} noteDelta={notes.net[p.id]} />
            ))}
          </div>
        </div>
        {update.log && (
          <aside className="shared-log" aria-label="This turn">
            <h2 className="section-label" style={{ fontSize: 12 }}>
              This turn
            </h2>
            {!ended &&
              notes.open.map((n, i) => {
                const speaker = noteSpeaker(n, update.log!.statements, view.turn.activePlayerId);
                return <NoteCard key={i} note={n} view={view} game={game} speakAs={{ id: speaker, name: byId[speaker]?.name ?? speaker }} onDismiss={() => notes.dismiss(n)} />;
              })}
            <TurnLogList log={update.log} view={view} game={ended ? undefined : game} answerQuestions={!ended} />
          </aside>
        )}
      </div>

      {fieldOf && <FieldScreen view={view} players={seatOrder} you={null} start={fieldOf} decks={decks} game={online && !ended ? game : undefined} onClose={() => setFieldOf(null)} />}
      {deckOf && deckView(deckOf)}
      {menuOpen && !ended && <StepMenu view={view} game={game} confirmFirst={false} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

/** What a seat card opens: that player's field (ADR 0126) and their Deck as brought to the game (ADR 0129). */
interface SeatOpeners {
  field: (seatId: string) => void;
  deck: (seatId: string) => void;
  decks: GameDecks | null;
}

function SeatCard({
  player,
  players,
  game,
  disabled,
  open,
  noteDelta,
}: {
  player: BoardPlayer;
  players: Record<string, BoardPlayer>;
  game?: ScreenProps['game'];
  disabled?: boolean;
  open: SeatOpeners;
  /** The net life change from the open readback notes (ADR 0136). */
  noteDelta?: number;
}) {
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
          <button className="say-for" onClick={() => open.field(player.id)} aria-label={`${player.name}'s field`}>
            Field
          </button>
          {open.decks?.decks.some((d) => d.seatId === player.id) && (
            <button className="say-for" onClick={() => open.deck(player.id)} aria-label={`${player.name}'s Deck`}>
              Deck
            </button>
          )}
          {game && !player.out && <SayFor game={game} seat={{ id: player.id, name: player.name }} disabled={disabled} />}
        </span>
      </div>
      {player.commander && <span className="seat-sub" style={{ fontSize: 14 }}>{player.commander}</span>}
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span className="num seat-life" style={player.out ? { textDecoration: 'line-through', textDecorationThickness: 6 } : undefined}>
          {player.life}
        </span>
        {noteDelta !== undefined && (
          <span className="num note-delta" style={{ fontSize: 22 }} aria-label={`${noteDelta > 0 ? '+' : '−'}${Math.abs(noteDelta)} from the app's notes`}>
            {noteDelta > 0 ? `+${noteDelta}` : `−${-noteDelta}`}
          </span>
        )}
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
