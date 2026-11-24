import { useState } from 'react';
import { More } from '../../icons.js';
import { Sheet } from '../../decks/parts.js';
import type { ScreenProps } from '../useGame.js';

/** The board's Game menu (ADR 0102): End game, with its confirm in the same sheet. */
export function GameMenuButton({ game }: { game: ScreenProps['game'] }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const online = game.connection === 'open';
  const close = () => {
    setOpen(false);
    setConfirming(false);
  };

  return (
    <>
      <button className="icon-btn" aria-label="Game menu" onClick={() => setOpen(true)}>
        <More />
      </button>
      {open && !confirming && (
        <Sheet title="Game" onClose={close}>
          <div className="menu-list">
            <button className="btn danger" disabled={!online} onClick={() => setConfirming(true)}>
              End game
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
