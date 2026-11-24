import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useState } from 'react';
import { AccountApiError, signIn, signUp, type Account } from './api.js';

const messageOf = (e: unknown) => (e instanceof AccountApiError ? e.message : 'Something went wrong. Try again.');

/** `/account` when signed out: one-button passkey sign-in, or a new account (ADRs 0088, 0103, 0105). */
export function SignedOut({ onSignedIn }: { onSignedIn: (account: Account) => void }) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');

  if (!browserSupportsWebAuthn()) {
    return (
      <section className="panel">
        <h2 className="display" style={{ margin: 0, fontSize: 20 }}>
          This browser can't save a passkey
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          You can still join games as a Guest. Or create your account on your phone, then sign in here with its QR code.
        </p>
      </section>
    );
  }

  const run = async (attempt: () => Promise<Account>) => {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await attempt());
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  if (!creating) {
    return (
      <section className="account-start">
        <p className="muted" style={{ margin: 0 }}>
          An account keeps a list of your games, brings your seat to any device, and holds the Decks you import. You
          don't need one to play.
        </p>
        <button className="btn btn-primary" style={{ height: 60, fontSize: 19 }} disabled={busy} onClick={() => void run(signIn)}>
          {busy ? 'Signing in…' : 'Sign in with a passkey'}
        </button>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button
          className="btn"
          style={{ height: 52 }}
          onClick={() => {
            setCreating(true);
            setError(null);
          }}
        >
          Create account
        </button>
        <p className="faint" style={{ margin: 0, fontSize: 14 }}>
          On a laptop without your passkey, choose your phone at the prompt and scan its QR code.
        </p>
      </section>
    );
  }

  return (
    <form
      className="account-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void run(() => signUp(displayName, email));
      }}
    >
      <label className="field">
        Display name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={24}
          autoComplete="nickname"
          required
          autoFocus
        />
      </label>
      <label className="field">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-describedby="email-hint"
          required
        />
      </label>
      <p id="email-hint" className="faint" style={{ margin: 0, fontSize: 14 }}>
        Your name fills in when you join a game. Your email stays private; nobody at the table sees it.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn" style={{ height: 56, padding: '0 20px' }} onClick={() => setCreating(false)}>
          Back
        </button>
        <button type="submit" className="btn btn-primary" style={{ flexGrow: 1 }} disabled={busy}>
          {busy ? 'Saving your passkey…' : 'Create account'}
        </button>
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 14 }}>
        Your device saves a passkey: Face ID, a fingerprint or your screen lock. There's no password.
      </p>
    </form>
  );
}
