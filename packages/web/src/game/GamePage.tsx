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
  return <GameSession key={code} code={code} />;
}

/** Keyed by the code, so moving straight to another game starts its connection and seat memory afresh. */
function GameSession({ code }: { code: string }) {
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
  if (memory === 'watching') return update.started ? <BoardScreen {...props} you={null} /> : <SharedLobby {...props} />;
  // A remembered seat counts as held until the server refuses the claim, so a reconnect doesn't flash the seat picker.
  const you = update.you ?? memory?.seatId ?? null;
  if (you) return update.started ? <BoardScreen {...props} you={you} /> : <LobbyScreen {...props} you={you} />;
  if (update.ended) return <BoardScreen {...props} you={null} />;
  return update.started ? <LateScreen {...props} /> : <JoinScreen {...props} />;
}
