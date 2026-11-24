import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { clearOldChallenges, saveChallenge, takeChallenge } from './challenges.js';
import type { RelyingParty } from './relyingParty.js';

const RP_NAME = 'On The Stack';

export type Failure = { error: string };

const tooSlow: Failure = { error: 'That took too long. Try again.' };
const unchecked: Failure = { error: "That passkey couldn't be checked. Try again." };

interface Deps {
  db: D1Database;
  rp: RelyingParty;
  now: Date;
  newId: () => string;
}

/**
 * Starts sign-up. The challenge's id doubles as the new account's id, so the passkey's user handle is the account
 * id and the account row only appears once the passkey is verified (ADR 0103).
 */
export async function signUpOptions(
  { db, rp, now, newId }: Deps,
  { displayName, email }: { displayName: string; email: string },
): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const accountId = newId();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.id,
    userName: email,
    userDisplayName: displayName,
    userID: new Uint8Array(new TextEncoder().encode(accountId)),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  await clearOldChallenges(db, now);
  await saveChallenge(db, accountId, options.challenge, now);
  return { challengeId: accountId, options };
}

async function verifyNewPasskey(rp: RelyingParty, challenge: string, response: RegistrationResponseJSON) {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: false,
  }).catch(() => null);
  return verification?.verified ? verification.registrationInfo.credential : null;
}

function insertPasskey(
  db: D1Database,
  id: string,
  accountId: string,
  credential: NonNullable<Awaited<ReturnType<typeof verifyNewPasskey>>>,
  label: string,
  at: string,
) {
  return db
    .prepare(
      `INSERT INTO sign_ins (id, account_id, kind, external_id, public_key, counter, transports, label, created_at, used_at)
       VALUES (?, ?, 'passkey', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, accountId, credential.id, credential.publicKey, credential.counter, JSON.stringify(credential.transports ?? []), label, at, at);
}

export async function signUp(
  { db, rp, now, newId }: Deps,
  challengeId: string,
  sent: { displayName: string; email: string; response: RegistrationResponseJSON; label: string },
): Promise<{ accountId: string } | Failure> {
  const challenge = await takeChallenge(db, challengeId, now);
  if (!challenge) return tooSlow;
  const credential = await verifyNewPasskey(rp, challenge, sent.response);
  if (!credential) return unchecked;
  const at = now.toISOString();
  await db.batch([
    db
      .prepare('INSERT INTO accounts (id, display_name, email, created_at) VALUES (?, ?, ?, ?)')
      .bind(challengeId, sent.displayName, sent.email, at),
    insertPasskey(db, newId(), challengeId, credential, sent.label, at),
  ]);
  return { accountId: challengeId };
}

/** Starts adding another passkey to a signed-in account, leaving out the ones it already has. */
export async function addPasskeyOptions(
  { db, rp, now, newId }: Deps,
  account: { id: string; displayName: string; email: string },
): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const { results } = await db
    .prepare("SELECT external_id, transports FROM sign_ins WHERE account_id = ? AND kind = 'passkey'")
    .bind(account.id)
    .all<{ external_id: string; transports: string }>();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.id,
    userName: account.email,
    userDisplayName: account.displayName,
    userID: new Uint8Array(new TextEncoder().encode(account.id)),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    excludeCredentials: results.map((r) => ({ id: r.external_id, transports: JSON.parse(r.transports) as string[] })),
  });
  const challengeId = newId();
  await clearOldChallenges(db, now);
  await saveChallenge(db, challengeId, options.challenge, now);
  return { challengeId, options };
}

export async function addPasskey(
  { db, rp, now, newId }: Deps,
  challengeId: string,
  accountId: string,
  sent: { response: RegistrationResponseJSON; label: string },
): Promise<{ ok: true } | Failure> {
  const challenge = await takeChallenge(db, challengeId, now);
  if (!challenge) return tooSlow;
  const credential = await verifyNewPasskey(rp, challenge, sent.response);
  if (!credential) return unchecked;
  await insertPasskey(db, newId(), accountId, credential, sent.label, now.toISOString()).run();
  return { ok: true };
}

/** Starts sign-in with no passkeys listed, so the device offers whichever of its passkeys are ours (ADR 0103). */
export async function signInOptions({
  db,
  rp,
  now,
  newId,
}: Deps): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const options = await generateAuthenticationOptions({ rpID: rp.id, userVerification: 'preferred' });
  const challengeId = newId();
  await clearOldChallenges(db, now);
  await saveChallenge(db, challengeId, options.challenge, now);
  return { challengeId, options };
}

export async function signIn(
  { db, rp, now }: Deps,
  challengeId: string,
  response: AuthenticationResponseJSON,
): Promise<{ accountId: string } | Failure> {
  const challenge = await takeChallenge(db, challengeId, now);
  if (!challenge) return tooSlow;
  const row = await db
    .prepare("SELECT id, account_id, public_key, counter, transports FROM sign_ins WHERE kind = 'passkey' AND external_id = ?")
    .bind(response.id)
    .first<{ id: string; account_id: string; public_key: ArrayBuffer | number[]; counter: number; transports: string }>();
  if (!row) return { error: "This passkey isn't linked to an account anymore." };
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    credential: {
      id: response.id,
      publicKey: new Uint8Array(row.public_key),
      counter: row.counter,
      transports: JSON.parse(row.transports) as WebAuthnCredential['transports'],
    },
    requireUserVerification: false,
  }).catch(() => null);
  if (!verification?.verified) return unchecked;
  await db
    .prepare('UPDATE sign_ins SET counter = ?, used_at = ? WHERE id = ?')
    .bind(verification.authenticationInfo.newCounter, now.toISOString(), row.id)
    .run();
  return { accountId: row.account_id };
}
