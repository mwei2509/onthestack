import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type { Account, Passkey } from '@onthestack/server/accounts';

export type { Account, Passkey } from '@onthestack/server/accounts';

/** A failed request or passkey prompt, with a message to show. */
export class AccountApiError extends Error {}

export async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new AccountApiError("Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const sent = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new AccountApiError(sent?.error ?? 'Something went wrong. Try again.');
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

/** Runs the device's passkey prompt, turning its errors into something to tell the player. */
export async function passkeyPrompt<T>(start: () => Promise<T>): Promise<T> {
  try {
    return await start();
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'NotAllowedError' || name === 'AbortError') {
      throw new AccountApiError('The passkey prompt was closed. Try again when you’re ready.');
    }
    if (name === 'InvalidStateError') throw new AccountApiError('This device already has a passkey for this account.');
    throw new AccountApiError("The passkey didn't work. Try again.");
  }
}

export const fetchAccount = () => call<{ account: Account | null }>('/api/account').then((r) => r.account);

export async function signUp(displayName: string, email: string): Promise<Account> {
  const optionsJSON = await call<PublicKeyCredentialCreationOptionsJSON>('/api/account/sign-up/options', 'POST', {
    displayName,
    email,
  });
  const response = await passkeyPrompt(() => startRegistration({ optionsJSON }));
  return (await call<{ account: Account }>('/api/account/sign-up', 'POST', { displayName, email, response })).account;
}

export async function signIn(): Promise<Account> {
  const optionsJSON = await call<PublicKeyCredentialRequestOptionsJSON>('/api/account/sign-in/options', 'POST');
  const response = await passkeyPrompt(() => startAuthentication({ optionsJSON }));
  return (await call<{ account: Account }>('/api/account/sign-in', 'POST', { response })).account;
}

export const signOut = () => call<null>('/api/account/sign-out', 'POST');

export const signOutEverywhere = () => call<null>('/api/account/sign-out-everywhere', 'POST');
export const updateAccount = (changes: { displayName?: string; email?: string }) =>
  call<{ account: Account }>('/api/account', 'PATCH', changes).then((r) => r.account);
export const deleteAccount = () => call<null>('/api/account', 'DELETE');
export const listPasskeys = () => call<Passkey[]>('/api/account/passkeys');
export const removePasskey = (id: string) => call<null>(`/api/account/passkeys/${encodeURIComponent(id)}`, 'DELETE');

export async function addPasskey(): Promise<Passkey[]> {
  const optionsJSON = await call<PublicKeyCredentialCreationOptionsJSON>('/api/account/passkeys/options', 'POST');
  const response = await passkeyPrompt(() => startRegistration({ optionsJSON }));
  return call<Passkey[]>('/api/account/passkeys', 'POST', { response });
}
