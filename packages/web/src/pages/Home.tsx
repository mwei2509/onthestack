import { useState } from 'react';
import { useNavigate } from 'react-router';

export function Home() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 20 }}>
        <button className="btn btn-primary" style={{ height: 64, fontSize: 21, borderRadius: 18 }} onClick={newGame} disabled={creating}>
          {creating ? 'Creating…' : 'New game'}
        </button>
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--danger)', textAlign: 'center' }}>
            {error}
          </p>
        )}
        <p className="faint" style={{ margin: 0, fontSize: 14, textAlign: 'center' }}>
          Joining a friend? Open the link they shared.
        </p>
      </div>
    </div>
  );
}
