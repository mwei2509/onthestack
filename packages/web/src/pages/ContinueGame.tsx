import type { GameSummary } from '@onthestack/server/protocol';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { forgetGame, lastGame } from '../game/lastGame.js';

/** The game this browser was last in, while it's still in the lobby or being played (ADR 0111). */
export function ContinueGame() {
  const [game, setGame] = useState<({ code: string } & GameSummary) | null>(null);

  useEffect(() => {
    const code = lastGame();
    if (!code) return;
    let cancelled = false;
    fetch(`/api/games/${encodeURIComponent(code)}`)
      .then(async (res) => {
        if (res.status === 404) return forgetGame(code);
        if (!res.ok) return;
        const summary = (await res.json()) as { code: string } & GameSummary;
        if (summary.status === 'ended') return forgetGame(code);
        if (!cancelled) setGame(summary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!game) return null;
  return (
    <Link className="btn continue-game" to={`/g/${game.code}`}>
      <span className="display">Continue {game.code}</span>
      <span className="muted">{game.status === 'lobby' ? 'In the lobby' : <>Turn <span className="count">{game.turn}</span></>}</span>
    </Link>
  );
}
