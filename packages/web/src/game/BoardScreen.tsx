import { GameHeader } from './parts.js';
import type { ScreenProps } from './useGame.js';

export function BoardScreen({ code, update }: ScreenProps) {
  const view = update.view;
  return (
    <div className="phone">
      <GameHeader code={code} />
      <h1 className="title">The game has started</h1>
      {view && (
        <p className="muted">
          Turn {view.turn.number} · {view.players[view.turn.activePlayerId]?.name}'s {view.turn.step}
        </p>
      )}
    </div>
  );
}
