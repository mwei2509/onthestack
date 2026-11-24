import type { TableView } from '@onthestack/engine';
import type { TurnLog } from '@onthestack/server/protocol';
import { useState } from 'react';
import { Sheet } from '../../decks/parts.js';
import type { ScreenProps } from '../useGame.js';
import { describeEntry, namesFor } from './describe.js';

const STATUS_TEXT = { interpreting: 'Interpreting…', failed: "Couldn't interpret" } as const;

/** What the log says right now: the newest statement's state, if it hasn't been read yet. */
export function latestStatus(log: TurnLog | null): 'interpreting' | 'failed' | null {
  const last = log?.statements.at(-1);
  return last && last.status !== 'read' ? last.status : null;
}

/** The turn's log: each statement, who said it, how it was read, then what was tapped (ADR 0106). */
export function TurnLogList({ log, view, game }: { log: TurnLog; view: TableView; game?: ScreenProps['game'] }) {
  const names = namesFor(view);
  const taps = log.entries.filter((e) => e.from.length === 0);
  if (log.statements.length === 0 && taps.length === 0) {
    return <p className="faint" style={{ margin: 0, fontSize: 14 }}>Nothing yet this turn.</p>;
  }
  const anyFailed = log.statements.some((s) => s.status === 'failed');
  return (
    <div className="turn-log">
      {log.statements.length > 0 && (
        <ol className="log-statements">
          {log.statements.map((s) => {
            const readings = log.entries.filter((e) => e.from.includes(s.id));
            return (
              <li key={s.id} className={`log-statement ${s.status}`}>
                <span className="log-who display">{names.player(s.playerId)}</span>
                <span className="log-said">“{s.text}”</span>
                {s.status === 'read' ? (
                  readings.length > 0 ? (
                    <ul className="log-readings">
                      {readings.map((e, i) => (
                        <li key={i}>{describeEntry(e, names, view.turn.step)}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="log-status faint">Read: nothing to record</span>
                  )
                ) : (
                  <span className="log-status" role={s.status === 'failed' ? 'alert' : undefined}>
                    {STATUS_TEXT[s.status]}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {anyFailed && game && (
        <button className="btn" style={{ alignSelf: 'flex-start', height: 44 }} onClick={() => game.send({ type: 'retryInterpretation' })}>
          Try again
        </button>
      )}
      {taps.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h3 className="section-label" style={{ fontSize: 11 }}>
            Tapped
          </h3>
          <ul className="log-readings">
            {taps.map((e, i) => (
              <li key={i}>{describeEntry(e, names, view.turn.step)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "This turn · N things happened", which opens the log (ADR 0106). */
export function ThisTurn({ log, view, game }: { log: TurnLog; view: TableView; game: ScreenProps['game'] }) {
  const [open, setOpen] = useState(false);
  const count = log.entries.length;
  const status = latestStatus(log);
  return (
    <>
      <button className="this-turn" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="5" cy="5" r="1.5" />
          <circle cx="5" cy="10" r="1.5" />
          <circle cx="5" cy="15" r="1.5" />
          <path d="M9 5h8M9 10h8M9 15h5" />
        </svg>
        <span style={{ flexGrow: 1 }}>
          <span className="display" style={{ fontWeight: 700 }}>
            This turn
          </span>{' '}
          <span className="muted">· {count === 1 ? '1 thing happened' : `${count} things happened`}</span>
        </span>
        {status && <span className={`log-chip ${status}`}>{status === 'interpreting' ? 'Reading…' : 'Not read'}</span>}
      </button>
      {open && (
        <Sheet title="This turn" onClose={() => setOpen(false)}>
          <div style={{ maxHeight: '60dvh', overflowY: 'auto' }}>
            <TurnLogList log={log} view={view} game={game} />
          </div>
        </Sheet>
      )}
    </>
  );
}

/** The "Say what happened…" bar in the dock, where Hold to talk will go (ADR 0106). */
export function SayBar({ game, disabled }: { game: ScreenProps['game']; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const send = () => {
    const said = text.trim();
    if (!said) return;
    game.send({ type: 'statement', text: said });
    setText('');
    setOpen(false);
  };
  return (
    <>
      <button className="say-bar" onClick={() => setOpen(true)} disabled={disabled}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 5h12v8H9l-4 3v-3H4z" />
        </svg>
        Say what happened…
      </button>
      {open && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form
            className="compose"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label className="field" style={{ fontSize: 13 }}>
              What happened?
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                  if (e.key === 'Escape') setOpen(false);
                }}
                maxLength={500}
                rows={2}
                placeholder="I take 3 from Theo's Raging Goblin"
                autoFocus
              />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn" style={{ height: 52, padding: '0 18px' }} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flexGrow: 1, height: 52 }} disabled={!text.trim()}>
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** The newest statement's state, shown briefly above the dock. */
export function LogStatus({ log, game }: { log: TurnLog | null; game: ScreenProps['game'] }) {
  const status = latestStatus(log);
  if (!status) return null;
  return (
    <div className={`log-status-line ${status}`} role="status">
      {status === 'interpreting' ? (
        <>
          <span className="spinner" aria-hidden /> Interpreting…
        </>
      ) : (
        <>
          Couldn't interpret that.
          <button className="btn btn-text" style={{ height: 32, color: 'var(--accent-hover)' }} onClick={() => game.send({ type: 'retryInterpretation' })}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}
