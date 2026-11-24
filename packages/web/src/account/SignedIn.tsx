import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sheet } from '../decks/parts.js';
import { sinceDay } from '../decks/format.js';
import {
  AccountApiError,
  addPasskey,
  deleteAccount,
  listPasskeys,
  removePasskey,
  signOut,
  signOutEverywhere,
  updateAccount,
  type Account,
  type Passkey,
} from './api.js';

type SheetKind = 'edit' | 'delete' | null;

const messageOf = (e: unknown) => (e instanceof AccountApiError ? e.message : 'Something went wrong. Try again.');

/** The account page (ADR 0105): name and email, passkeys, signing out, and deleting the account (ADR 0094). */
export function SignedIn({ account, onChange }: { account: Account; onChange: (account: Account | null) => void }) {
  const navigate = useNavigate();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(account.displayName);
  const [email, setEmail] = useState(account.email);

  useEffect(() => {
    listPasskeys().then(setPasskeys, (e: unknown) => setError(messageOf(e)));
  }, []);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(messageOf(e));
    }
    setBusy(false);
  };

  const leave = () => {
    onChange(null);
    navigate('/', { replace: true });
  };

  const now = new Date();
  return (
    <>
      <section className="panel">
        <div className="account-row">
          <div className="account-text">
            <span className="account-name">{account.displayName}</span>
            <span className="faint">{account.email} · only you see this</span>
          </div>
          <button
            className="btn btn-light"
            style={{ height: 40, fontSize: 15 }}
            onClick={() => {
              setDisplayName(account.displayName);
              setEmail(account.email);
              setError(null);
              setSheet('edit');
            }}
          >
            Edit
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-label" style={{ margin: 0 }}>
          Passkeys
        </h2>
        {passkeys === null ? (
          <div aria-busy style={{ height: 48 }} />
        ) : (
          <ul className="passkey-list">
            {passkeys.map((p) => (
              <li key={p.id} className="passkey-row">
                <div className="account-text">
                  <span>{p.label}</span>
                  <span className="faint">
                    Added {sinceDay(p.createdAt, now)}
                    {p.usedAt && ` · last used ${sinceDay(p.usedAt, now)}`}
                  </span>
                </div>
                {passkeys.length > 1 && (
                  <button
                    className="btn btn-text"
                    style={{ height: 40, fontSize: 15, color: 'var(--danger)' }}
                    disabled={busy}
                    aria-label={`Remove ${p.label} passkey`}
                    onClick={() =>
                      act(async () => {
                        await removePasskey(p.id);
                        setPasskeys(passkeys.filter((other) => other.id !== p.id));
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {passkeys?.length === 1 && (
          <p className="faint" style={{ margin: 0, fontSize: 14 }}>
            Add a passkey on another device too, so losing this one doesn't lock you out.
          </p>
        )}
        <button className="btn" disabled={busy} onClick={() => act(async () => setPasskeys(await addPasskey()))}>
          Add a passkey
        </button>
      </section>

      {error && !sheet && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <div className="account-actions">
        <button className="btn" disabled={busy} onClick={() => act(async () => (await signOut(), leave()))}>
          Sign out
        </button>
        <button className="btn" disabled={busy} onClick={() => act(async () => (await signOutEverywhere(), leave()))}>
          Sign out everywhere
        </button>
        <button className="btn danger" onClick={() => setSheet('delete')}>
          Delete account
        </button>
      </div>

      {sheet === 'edit' && (
        <Sheet title="Edit account" onClose={() => setSheet(null)}>
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                onChange(await updateAccount({ displayName, email }));
                setSheet(null);
              });
            }}
          >
            <label className="field">
              Display name
              <input value={displayName} maxLength={24} autoComplete="nickname" required autoFocus onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label className="field">
              Email
              <input type="email" value={email} autoComplete="email" required onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Save
            </button>
          </form>
        </Sheet>
      )}

      {sheet === 'delete' && (
        <Sheet title="Delete your account?" onClose={() => setSheet(null)}>
          <ul className="muted delete-list">
            <li>Your passkeys, email and sign-ins on every device are removed.</li>
            <li>Your private Decks are deleted. Your public Decks stay in the library for others, with no owner.</li>
            <li>Your seats in past games become Guest seats under the same name.</li>
          </ul>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flexGrow: 1, height: 56 }} onClick={() => setSheet(null)}>
              Keep it
            </button>
            <button
              className="btn danger"
              style={{ flexGrow: 1, height: 56 }}
              disabled={busy}
              onClick={() => act(async () => (await deleteAccount(), leave()))}
            >
              Delete my account
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
