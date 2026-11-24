import { useState } from 'react';
import { useNavigate } from 'react-router';
import { findGame, formatJoinCode, joinCodeDigits } from '../game/joinCode.js';

/** Join game on Home: type the six-digit code from the table (ADR 0095). */
export function JoinGame({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    const found = await findGame(digits);
    if ('code' in found) return navigate(`/g/${found.code}`);
    setError(found.error);
    setBusy(false);
  };

  return (
    <form
      className="join-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (digits.length === 6 && !busy) void join();
      }}
    >
      <label className="field">
        Join code
        <input
          className="join-input"
          value={formatJoinCode(digits)}
          onChange={(e) => {
            setDigits(joinCodeDigits(e.target.value));
            setError(null);
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="000 000"
          aria-describedby="join-hint"
          autoFocus
        />
      </label>
      {error ? (
        <p role="alert" className="form-error" style={{ margin: 0 }}>
          {error}
        </p>
      ) : (
        <p id="join-hint" className="faint" style={{ margin: 0, fontSize: 14 }}>
          The six digits shown in the game's lobby or on the shared screen.
        </p>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn" style={{ height: 56, padding: '0 20px', borderRadius: 16 }} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" style={{ flexGrow: 1 }} disabled={digits.length < 6 || busy}>
          {busy ? 'Finding…' : 'Join'}
        </button>
      </div>
    </form>
  );
}
