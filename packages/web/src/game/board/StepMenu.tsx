import type { TableView } from '@onthestack/engine';
import { useState } from 'react';
import type { ScreenProps } from '../useGame.js';
import { nextPlayerId, STEP_NAMES } from './steps.js';

/**
 * Jump forward to a Step this turn, or end the turn (ADR 0075). On a phone that isn't the active player's, it first
 * asks, so the table is never stuck when someone steps away but nobody moves another player's turn by accident (ADR 0056).
 */
export function StepMenu({ view, game, confirmFirst, onClose }: { view: TableView; game: ScreenProps['game']; confirmFirst: boolean; onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(!confirmFirst);
  const active = view.players[view.turn.activePlayerId]!;
  const next = view.players[nextPlayerId(view)]!;
  const from = view.turn.step;

  const jump = (to: (typeof view.stepsAhead)[number] | 'endTurn') => {
    game.send({ type: 'jumpToStep', from, to });
    onClose();
  };

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="step-menu">
        <div className="handle" />
        <h2 id="step-menu" className="display" style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
          {confirmed ? 'Jump to a step' : `It's ${active.name}'s turn`}
        </h2>
        {!confirmed ? (
          <>
            <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>
              Move {active.name}'s turn on for them? Only if they've stepped away.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ height: 56, padding: '0 20px', borderRadius: 16 }} onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ flexGrow: 1 }} onClick={() => setConfirmed(true)}>
                Move their turn on
              </button>
            </div>
          </>
        ) : (
          <>
            <ul className="step-list">
              {view.stepsAhead.map((step) => (
                <li key={step}>
                  <button onClick={() => jump(step)}>{STEP_NAMES[step]}</button>
                </li>
              ))}
              <li>
                <button onClick={() => jump('endTurn')}>
                  End turn <span className="muted">· {next.name}'s turn</span>
                </button>
              </li>
            </ul>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </section>
    </div>
  );
}
