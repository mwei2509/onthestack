import { useEffect, useRef, useState } from 'react';
import { More } from '../../icons.js';
import { Sheet } from '../../decks/parts.js';
import { useTestPhase } from '../testPhase.js';
import type { ScreenProps } from '../useGame.js';

type Showing = 'menu' | 'confirm' | 'restart' | 'report' | 'reported';

/**
 * The board's Game menu (ADR 0102): Restart game and End game, each with its confirm (ADR 0145), and during the test
 * phase "Something's wrong?" (ADR 0118).
 */
export function GameMenuButton({ game }: { game: ScreenProps['game'] }) {
  const [showing, setShowing] = useState<Showing | null>(null);
  const [report, setReport] = useState('');
  const testPhase = useTestPhase();
  const online = game.connection === 'open';
  const sentFrom = useRef<string | null>(null);
  const open = showing !== null;
  const confirming = showing === 'confirm';
  const close = () => {
    sentFrom.current = null;
    setShowing(null);
  };

  useEffect(() => {
    if (showing === 'report' && sentFrom.current !== null && game.reportedId !== sentFrom.current) {
      sentFrom.current = null;
      setReport('');
      setShowing('reported');
    }
  }, [game.reportedId, showing]);

  /** Opening the form forgets any earlier send, so only a reply to this one shows "Thanks". */
  const openReport = () => {
    sentFrom.current = null;
    setShowing('report');
  };

  return (
    <>
      <button className="icon-btn" aria-label="Game menu" onClick={() => setShowing('menu')}>
        <More />
      </button>
      {showing === 'menu' && (
        <Sheet title="Game" onClose={close}>
          <div className="menu-list">
            {testPhase && (
              <button className="btn" onClick={openReport}>
                Something's wrong?
              </button>
            )}
            <button className="btn" disabled={!online} onClick={() => setShowing('restart')}>
              Restart game
            </button>
            <button className="btn danger" disabled={!online} onClick={() => setShowing('confirm')}>
              End game
            </button>
          </div>
        </Sheet>
      )}
      {showing === 'report' && (
        <Sheet title="Something's wrong?" onClose={close}>
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!report.trim()) return;
              sentFrom.current = game.reportedId ?? '';
              game.send({ type: 'report', text: report.trim() });
            }}
          >
            <label className="field">
              What did you expect to happen?
              <textarea
                className="report-text"
                value={report}
                maxLength={2000}
                rows={4}
                autoFocus
                placeholder="I would have expected Hinterland Sanctifier to gain me life"
                onChange={(e) => setReport(e.target.value)}
              />
            </label>
            <p className="hint" style={{ margin: 0 }}>
              It's saved with the game as it is right now, so it can be looked into later. It doesn't change the game.
            </p>
            <button className="btn btn-primary" type="submit" disabled={!online || !report.trim()}>
              Send report
            </button>
          </form>
        </Sheet>
      )}
      {showing === 'reported' && (
        <Sheet title="Thanks, it's saved" onClose={close}>
          <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>
            Your report and this game's state were saved. Reference <span className="count">{game.reportedId?.slice(0, 8)}</span>.
          </p>
          <button className="btn" style={{ height: 52 }} onClick={close}>
            Back to the game
          </button>
        </Sheet>
      )}
      {showing === 'restart' && (
        <Sheet title="Restart the game for everyone?" onClose={close}>
          <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>
            Back to the lobby with the same seats and Decks. Everything played so far is cleared. This can't be undone.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flexGrow: 1, height: 56 }} onClick={close}>
              Cancel
            </button>
            <button
              className="btn danger"
              style={{ flexGrow: 1, height: 56 }}
              disabled={!online}
              onClick={() => {
                game.send({ type: 'restart' });
                close();
              }}
            >
              Restart game
            </button>
          </div>
        </Sheet>
      )}
      {open && confirming && (
        <Sheet title="End the game for everyone?" onClose={close}>
          <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>
            The final board is kept, read-only. This can't be undone.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flexGrow: 1, height: 56 }} onClick={close}>
              Cancel
            </button>
            <button
              className="btn danger"
              style={{ flexGrow: 1, height: 56 }}
              disabled={!online}
              onClick={() => {
                game.send({ type: 'end' });
                close();
              }}
            >
              End game
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
