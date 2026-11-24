import { Link, useParams } from 'react-router';
import { Logo } from '../icons.js';
import { BoardScreen } from './BoardScreen.js';
import { JoinScreen } from './lobby/JoinScreen.js';
import { LateScreen } from './lobby/LateScreen.js';
import { LobbyScreen } from './lobby/LobbyScreen.js';
import { SharedLobby } from './lobby/SharedLobby.js';
import { Toast } from './parts.js';
import { useGame, type GameConnection } from './useGame.js';

export function GamePage() {
  const code = (useParams().code ?? '').toUpperCase();
  const game = useGame(code);
  return (
    <>
      <Screen code={code} game={game} />
      <Toast message={game.error} />
    </>
  );
}

function Screen({ code, game }: { code: string; game: GameConnection }) {
  const { update, memory } = game;
  if (game.connection === 'missing') {
    return (
      <main className="center-screen">
        <Logo size={40} />
        <h1 className="title">No game called {code}</h1>
        <p className="muted" style={{ margin: 0 }}>
          Check the code with the table, or start a new game.
        </p>
        <Link to="/">Back to start</Link>
      </main>
    );
  }
  if (!update) {
    return (
      <main className="center-screen" aria-busy>
        <Logo size={40} />
        <p className="muted">Connecting to {code}…</p>
      </main>
    );
  }
  const props = { code, game, update };
  if (memory === 'watching') return update.started ? <BoardScreen {...props} /> : <SharedLobby {...props} />;
  if (update.you) return update.started ? <BoardScreen {...props} /> : <LobbyScreen {...props} you={update.you} />;
  return update.started ? <LateScreen {...props} /> : <JoinScreen {...props} />;
}
