import { useCallback, useEffect, useState } from 'react';
import { LoadError, PageHeader } from '../decks/parts.js';
import { AccountApiError, fetchAccount, type Account } from './api.js';
import { SignedIn } from './SignedIn.js';
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
      <PageHeader title="Account" back="/" backLabel="Back to home" />
      {account ? (
        <SignedIn account={account} onChange={setAccount} />
      ) : (
        <SignedOut onSignedIn={setAccount} />
      )}
    </div>
  );
}
