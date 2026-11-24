import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Logo, Plus } from '../icons.js';

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
      <header className="game-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={26} />
          <span className="display" style={{ fontSize: 17, fontWeight: 600 }}>
            On The Stack
          </span>
        </div>
      </header>
      <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 className="display" style={{ margin: 0, fontSize: 34, lineHeight: 1.1, fontWeight: 600, letterSpacing: '-0.02em' }}>
            The tally for your Commander table.
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>
            Life, commander damage, turns and steps, on every phone at the table. Your cards stay in charge.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button className="btn btn-primary" style={{ height: 64, fontSize: 19 }} onClick={newGame} disabled={creating}>
            <Plus />
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
      </main>
    </div>
  );
}
