import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { fetchAccount } from '../account/api.js';
import { ContinueGame } from './ContinueGame.js';
import { JoinGame } from './JoinGame.js';

export function Home() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetchAccount().then((account) => setName(account?.displayName ?? null), () => {});
  }, []);

  const newGame = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/games', { method: 'POST' });
      if (!res.ok) throw new Error();
      const { code } = (await res.json()) as { code: string };
      navigate(`/g/${code}`);
    } catch {
      setError("Couldn't create a game. Check your connection and try again.");
      setCreating(false);
    }
  };

  return (
    <div className="phone">
      <nav className="home-top">
        <Link to="/account">{name ?? 'Sign in'}</Link>
      </nav>
      <main className="home-main">
        <div className="home-cards" aria-hidden>
          <span className="home-card left" />
          <span className="home-card right" />
          <span className="home-card front">
            <span className="home-crest num">40</span>
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 className="home-title display">On The Stack</h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: '#D6CBDA' }}>Keep the tally. Play the game.</p>
        </div>
      </main>
      {joining ? (
        <div style={{ paddingBottom: 20 }}>
          <JoinGame onCancel={() => setJoining(false)} />
        </div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 20 }}>
        <ContinueGame />
        <button className="btn btn-primary" style={{ height: 64, fontSize: 21, borderRadius: 18 }} onClick={newGame} disabled={creating}>
          {creating ? 'Creating…' : 'New game'}
        </button>
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--danger)', textAlign: 'center' }}>
            {error}
          </p>
        )}
        <button className="btn" style={{ height: 56, fontSize: 17, borderRadius: 16 }} onClick={() => setJoining(true)}>
          Join game
        </button>
        <Link className="btn" to="/decks" style={{ height: 52, textDecoration: 'none', color: 'var(--text)' }}>
          Decks
        </Link>
        <p className="faint" style={{ margin: 0, fontSize: 14, textAlign: 'center' }}>
          Joining a friend? Tap Join game and type their code, or open their link.
        </p>
      </div>
      )}
    </div>
  );
}
