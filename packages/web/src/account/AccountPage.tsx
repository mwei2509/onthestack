import { useCallback, useEffect, useState } from 'react';
import { LoadError, PageHeader } from '../decks/parts.js';
import { AccountApiError, fetchAccount, signOut, type Account } from './api.js';
import { SignedOut } from './SignedOut.js';

/** `/account`: sign in or create an account when signed out, the account page when signed in (ADR 0105). */
export function AccountPage() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchAccount().then(setAccount, (e: unknown) =>
      setError(e instanceof AccountApiError ? e.message : "Couldn't load your account."),
    );
  }, []);
  useEffect(load, [load]);

  if (error) return <LoadError message={error} retry={load} />;
  if (account === undefined) return <div className="phone" aria-busy />;

  return (
    <div className="phone">
      <PageHeader title={account ? account.displayName : 'Account'} back="/" backLabel="Back to home" />
      {account ? (
        <section className="panel">
          <p className="muted" style={{ margin: 0 }}>
            Signed in as {account.displayName}.
          </p>
          <button className="btn" onClick={() => void signOut().then(() => setAccount(null), load)}>
            Sign out
          </button>
        </section>
      ) : (
        <SignedOut onSignedIn={setAccount} />
      )}
    </div>
  );
}
