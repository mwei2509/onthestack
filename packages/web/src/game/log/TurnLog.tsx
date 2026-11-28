import type { ReadbackNote, RulesWarning, TableView } from '@onthestack/engine';
import type { TurnLog } from '@onthestack/server/protocol';

type Question = TurnLog['questions'][number];
import { useState } from 'react';
import { Sheet } from '../../decks/parts.js';
import type { ScreenProps } from '../useGame.js';
import { describeEntry, namesFor } from './describe.js';
import { describeNote, noteStep, placeNotes } from './notes.js';
import { openWarnings, placeTasks, placeWarnings, undoneTasks } from './warnings.js';

const STATUS_TEXT = { interpreting: 'Interpreting…', failed: "Couldn't interpret" } as const;

/** What the log says right now: the newest statement's state, if it hasn't been read yet. */
export function latestStatus(log: TurnLog | null): 'interpreting' | 'failed' | null {
  const last = log?.statements.at(-1);
  return last && last.status !== 'read' ? last.status : null;
}

/**
 * Quick answers for the asked player: the question's own options, Yes / No, or the players for "which player?".
 * Each is a reading of what was said, never a suggested play (ADR 0043, principle 4).
 */
export function quickAnswers(q: Question, view: Pick<TableView, 'players'>): string[] {
  if (q.options?.length) return q.options;
  if (q.kind === 'yesNo') return ['Yes', 'No'];
  if (q.kind === 'choosePlayers') return Object.values(view.players).filter((p) => !p.out).map((p) => p.name);
  return [];
}

/** One of the reading's questions, as the canvas's "Question for you" card (ADR 0068). */
export function QuestionCard({ q, view, you, game, forAnyone }: { q: Question; view: TableView; you?: string | null; game?: ScreenProps['game']; forAnyone?: boolean }) {
  const names = namesFor(view);
  const mine = you === q.askPlayer;
  /** A Shared screen answers for the asked player (ADR 0107); a phone answers only its own questions. */
  const canAnswer = !!game && (mine || !!forAnyone);
  const answers = canAnswer ? quickAnswers(q, view) : [];
  return (
    <section className={`question-card${mine ? ' mine' : ''}`} aria-label={mine ? 'Question for you' : `Question for ${names.player(q.askPlayer)}`}>
      <span className="question-label display">{mine ? 'Question for you' : `Question for ${names.player(q.askPlayer)}`}</span>
      <p className="question-text display">{q.text}</p>
      {answers.length > 0 && (
        <div className="question-answers">
          {answers.map((a) => (
            <button key={a} className="btn" onClick={() => game!.send({ type: 'statement', text: a, answering: q.text, ...(mine ? {} : { seatId: q.askPlayer }) })}>
              {a}
            </button>
          ))}
        </div>
      )}
      <span className="faint" style={{ fontSize: 13 }}>
        {mine
          ? answers.length
            ? 'Or say it in your own words.'
            : 'Say what happened, in your own words.'
          : forAnyone
            ? `Answer for ${names.player(q.askPlayer)}, or use Say… on their card.`
            : `Waiting for ${names.player(q.askPlayer)}`}
      </span>
    </section>
  );
}

/** A PlayerTask on its player's phone, with Done (ADR 0125). */
function TaskCard({ task, game }: { task: TableView['playerTasks'][number]; game: ScreenProps['game'] }) {
  return (
    <section className="question-card mine" aria-label="Task for you">
      <span className="question-label display">Task for you</span>
      <p className="question-text display">{task.text}</p>
      <div className="question-answers">
        <button className="btn" onClick={() => game.send({ type: 'taskDone', playerId: task.playerId, text: task.text, from: task.from })}>
          Done
        </button>
      </div>
    </section>
  );
}

/** The phone's tray above the dock: the reading's open questions and this player's PlayerTasks (ADR 0057, 0068, 0125). */
export function QuestionTray({ log, view, you, game }: { log: TurnLog | null; view: TableView; you: string; game: ScreenProps['game'] }) {
  const tasks = undoneTasks(view.playerTasks).filter((t) => t.playerId === you);
  if (!log?.questions.length && tasks.length === 0) return null;
  return (
    <div className="question-tray" aria-live="polite">
      {log?.questions.map((q) => (
        <QuestionCard key={`${q.kind}:${q.askPlayer}:${q.about.join(',')}`} q={q} view={view} you={you} game={game} />
      ))}
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} game={game} />
      ))}
    </div>
  );
}

/** A PlayerTask as a line in the log, for everyone (ADR 0125). */
function TaskNote({ task, view }: { task: TableView['playerTasks'][number]; view: TableView }) {
  const names = namesFor(view);
  return (
    <div className={`log-task${task.doneBy ? ' settled' : ''}`}>
      <span className="log-warning-text">
        Task for {names.player(task.playerId)}: {task.text}
      </span>
      <span className="faint">{task.doneBy ? `Done · ${names.player(task.doneBy)}` : 'Not done yet'}</span>
    </div>
  );
}

/** What the app applied on its own, under the line that led to it (ADR 0134, 0136). */
function NoteLine({ note, view }: { note: ReadbackNote; view: TableView }) {
  const lines = describeNote(note, namesFor(view));
  const step = noteStep(note);
  if (lines.length === 0) return null;
  return (
    <div className="log-note">
      <span className="log-note-label display">{step ? `App · ${step}` : 'App'}</span>
      {lines.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}

/** A RulesWarning under the line that raised it, with "Do it anyway" for a seated player (ADR 0122, 0123). */
function WarningNote({ w, view, game }: { w: RulesWarning; view: TableView; game?: ScreenProps['game'] }) {
  const names = namesFor(view);
  const entry = w.entry;
  return (
    <div className={`log-warning${w.overriddenBy ? ' settled' : ''}`} role={w.overriddenBy ? undefined : 'alert'}>
      <span className="log-warning-text">{w.message}</span>
      {w.overriddenBy ? (
        <span className="faint">Done anyway · {names.player(w.overriddenBy)}</span>
      ) : (
        game &&
        entry &&
        entry.from.length > 0 && (
          <button className="btn btn-text log-warning-action" onClick={() => game.send({ type: 'doItAnyway', code: w.code, from: entry.from, objectIds: w.objectIds ?? [] })}>
            Do it anyway
          </button>
        )
      )}
    </div>
  );
}

/**
 * The turn's log: open questions, warnings and notes no statement led to, each statement with who said it, how it was
 * read, what the app applied after it and the warnings it raised, then what was tapped (ADR 0106, 0122, 0136). `override`: this device is a seat, so it can choose
 * "Do it anyway".
 */
export function TurnLogList({ log, view, game, answerQuestions, override }: { log: TurnLog; view: TableView; game?: ScreenProps['game']; answerQuestions?: boolean; override?: boolean }) {
  const names = namesFor(view);
  const taps = log.entries.filter((e) => e.from.length === 0);
  const warned = placeWarnings(view.warnings, log.statements.map((s) => s.id));
  const tasked = placeTasks(view.playerTasks, log.statements.map((s) => s.id));
  const noted = placeNotes(log.readbackNotes, log.entries, log.statements.map((s) => s.id));
  const overrideWith = override ? game : undefined;
  if (log.statements.length === 0 && taps.length === 0 && log.questions.length === 0 && view.warnings.length === 0 && view.playerTasks.length === 0 && log.readbackNotes.length === 0) {
    return <p className="faint" style={{ margin: 0, fontSize: 14 }}>Nothing yet this turn.</p>;
  }
  const anyFailed = log.statements.some((s) => s.status === 'failed');
  /** An entry from several statements is listed once, under the last of them ("2 or 3?" … "3"). */
  const order = new Map(log.statements.map((s, i) => [s.id, i]));
  const lastSaidIn = (from: string[]) => from.reduce((last, id) => ((order.get(id) ?? -1) > (order.get(last) ?? -1) ? id : last), from[0] ?? '');
  return (
    <div className="turn-log">
      {log.questions.map((q) => (
        <QuestionCard key={`${q.kind}:${q.askPlayer}:${q.about.join(',')}`} q={q} view={view} game={answerQuestions ? game : undefined} forAnyone={answerQuestions} />
      ))}
      {warned.top.map((w, i) => (
        <WarningNote key={`top${i}`} w={w} view={view} game={overrideWith} />
      ))}
      {tasked.top.map((t) => (
        <TaskNote key={t.id} task={t} view={view} />
      ))}
      {noted.top.map((n, i) => (
        <NoteLine key={`note${i}`} note={n} view={view} />
      ))}
      {log.statements.length > 0 && (
        <ol className="log-statements">
          {log.statements.map((s) => {
            const readings = log.entries.filter((e) => lastSaidIn(e.from) === s.id);
            const readLater = log.entries.some((e) => e.from.includes(s.id) && lastSaidIn(e.from) !== s.id);
            const asked = log.questions.find((q) => q.about.includes(s.id));
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
                  ) : readLater ? (
                    <span className="log-status faint">Read with a later statement</span>
                  ) : asked ? (
                    <span className="log-status">
                      Asked {names.player(asked.askPlayer)}: {asked.text}
                    </span>
                  ) : (
                    <span className="log-status faint">Read: nothing to record</span>
                  )
                ) : (
                  <span className="log-status" role={s.status === 'failed' ? 'alert' : undefined}>
                    {STATUS_TEXT[s.status]}
                  </span>
                )}
                {warned.byStatement.get(s.id)?.map((w, i) => (
                  <WarningNote key={i} w={w} view={view} game={overrideWith} />
                ))}
                {noted.byStatement.get(s.id)?.map((n, i) => (
                  <NoteLine key={`note${i}`} note={n} view={view} />
                ))}
                {tasked.byStatement.get(s.id)?.map((t) => (
                  <TaskNote key={t.id} task={t} view={view} />
                ))}
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
  const warnings = openWarnings(view.warnings).length;
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
        {warnings > 0 && <span className="log-chip warning">{warnings === 1 ? '1 warning' : `${warnings} warnings`}</span>}
        {status && <span className={`log-chip ${status}`}>{status === 'interpreting' ? 'Reading…' : 'Not read'}</span>}
      </button>
      {open && (
        <Sheet title="This turn" onClose={() => setOpen(false)}>
          <div style={{ maxHeight: '60dvh', overflowY: 'auto' }}>
            <TurnLogList log={log} view={view} game={game} override />
          </div>
        </Sheet>
      )}
    </>
  );
}

/** The text box for saying what happened, above the keyboard; `as` names the seat a Shared screen speaks for (ADR 0106, 0107). */
export function Compose({ game, as, onClose }: { game: ScreenProps['game']; as?: { id: string; name: string }; onClose: () => void }) {
  const [text, setText] = useState('');
  const send = () => {
    const said = text.trim();
    if (!said) return;
    game.send({ type: 'statement', text: said, ...(as ? { seatId: as.id } : {}) });
    onClose();
  };
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label className="field" style={{ fontSize: 13 }}>
          {as ? `Saying as ${as.name}` : 'What happened?'}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
              if (e.key === 'Escape') onClose();
            }}
            maxLength={500}
            rows={2}
            placeholder={as ? `I play a land (as ${as.name})` : "I take 3 from Theo's Raging Goblin"}
            autoFocus
          />
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn" style={{ height: 52, padding: '0 18px' }} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" style={{ flexGrow: 1, height: 52 }} disabled={!text.trim()}>
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

/** The "Say what happened…" bar in the dock, where Hold to talk will go (ADR 0106). */
export function SayBar({ game, disabled }: { game: ScreenProps['game']; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="say-bar" onClick={() => setOpen(true)} disabled={disabled}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 5h12v8H9l-4 3v-3H4z" />
        </svg>
        Say what happened…
      </button>
      {open && <Compose game={game} onClose={() => setOpen(false)} />}
    </>
  );
}

/** "Say…" on a seat's card at the Shared screen: speaks for that player (ADR 0107). */
export function SayFor({ game, seat, disabled }: { game: ScreenProps['game']; seat: { id: string; name: string }; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="say-for" onClick={() => setOpen(true)} disabled={disabled} aria-label={`Say what happened as ${seat.name}`}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 5h12v8H9l-4 3v-3H4z" />
        </svg>
        Say…
      </button>
      {open && <Compose game={game} as={seat} onClose={() => setOpen(false)} />}
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
