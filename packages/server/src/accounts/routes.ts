import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { z } from 'zod';
import { SeatName } from '../protocol.js';
import { challengeCookie, challengeId, clearedChallengeCookie } from './challenges.js';
import { deviceLabel } from './deviceLabel.js';
import { addPasskey, addPasskeyOptions, signIn, signInOptions, signUp, signUpOptions, type Failure } from './passkeys.js';
import { relyingPartyFor } from './relyingParty.js';
import {
  clearedSessionCookie,
  endAllSessions,
  endSession,
  findSession,
  sessionCookie,
  sessionToken,
  startSession,
} from './sessions.js';
import { deleteAccount, getAccount, listPasskeys, removePasskey, updateAccount } from './store.js';

export const ACCOUNT_PATH = /^\/api\/account(?:\/([a-z0-9/-]{1,120}))?$/;

const Email = z.string().trim().max(254, 'That email is too long').regex(/^[^\s@]+@[^\s@]+$/, "That doesn't look like an email");
const Profile = z.object({ displayName: SeatName, email: Email });
const Credential = z.looseObject({ id: z.string().min(1).max(1024), type: z.literal('public-key'), response: z.looseObject({}) });
const SignUp = Profile.extend({ response: Credential });
const WithCredential = z.object({ response: Credential });
const EditProfile = Profile.partial().refine((p) => p.displayName !== undefined || p.email !== undefined, 'Nothing to change');

export interface AccountDeps {
  db: D1Database;
  now: () => Date;
  newId: () => string;
  /** False once this address has made too many sign-in or sign-up attempts (ADR 0103). */
  limit: (key: string) => Promise<boolean>;
}

const json = (request: Request) => request.json().catch(() => null);
const notFound = () => new Response('Not found', { status: 404 });
const badRequest = (error: z.ZodError) => Response.json({ error: error.issues[0]?.message }, { status: 400 });

function withCookies(response: Response, ...cookies: string[]): Response {
  for (const cookie of cookies) response.headers.append('Set-Cookie', cookie);
  return response;
}

/**
 * `/api/account` (who is signed in), `sign-up/options` + `sign-up` and `sign-in/options` + `sign-in` (the passkey
 * ceremonies), `sign-out`, `sign-out-everywhere`, and the account page's own requests (`handleManage`).
 */
export async function handleAccount(request: Request, rest: string | undefined, deps: AccountDeps): Promise<Response> {
  const { db, now } = deps;
  const token = sessionToken(request);
  const session = token ? await findSession(db, token, now()) : null;

  if (rest === undefined && request.method === 'GET') {
    const account = session ? await getAccount(db, session.accountId) : null;
    const response = Response.json({ account });
    if (token && !account) return withCookies(response, clearedSessionCookie(request));
    return session?.renewed ? withCookies(response, sessionCookie(request, token!)) : response;
  }

  if (rest === 'sign-out' && request.method === 'POST') {
    if (token) await endSession(db, token);
    return withCookies(new Response(null, { status: 204 }), clearedSessionCookie(request));
  }

  if (rest === 'sign-out-everywhere' && request.method === 'POST') {
    if (!session) return Response.json({ error: 'Not signed in' }, { status: 401 });
    await endAllSessions(db, session.accountId);
    return withCookies(new Response(null, { status: 204 }), clearedSessionCookie(request));
  }

  const ceremony = ['sign-up/options', 'sign-up', 'sign-in/options', 'sign-in'].includes(rest ?? '');
  if (ceremony && request.method === 'POST') return handleCeremony(request, rest!, deps);

  return (await handleManage(request, rest, session?.accountId ?? null, deps)) ?? notFound();
}

const PASSKEY = /^passkeys\/([A-Za-z0-9-]{1,64})$/;

/**
 * The signed-in account's own page: `PATCH`/`DELETE /api/account` (edit or delete it) and `/api/account/passkeys`
 * (list, add, remove). Null when the request is none of these.
 */
async function handleManage(
  request: Request,
  rest: string | undefined,
  accountId: string | null,
  deps: AccountDeps,
): Promise<Response | null> {
  const { method } = request;
  const passkey = rest !== undefined && method === 'DELETE' ? PASSKEY.exec(rest) : null;
  const matched =
    (rest === undefined && (method === 'PATCH' || method === 'DELETE')) ||
    (rest === 'passkeys' && (method === 'GET' || method === 'POST')) ||
    (rest === 'passkeys/options' && method === 'POST') ||
    passkey !== null;
  if (!matched) return null;
  if (!accountId) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const { db } = deps;

  if (rest === undefined && method === 'PATCH') {
    const body = EditProfile.safeParse(await json(request));
    if (!body.success) return badRequest(body.error);
    return Response.json({ account: await updateAccount(db, accountId, body.data) });
  }

  if (rest === undefined && method === 'DELETE') {
    await deleteAccount(db, accountId);
    return withCookies(new Response(null, { status: 204 }), clearedSessionCookie(request));
  }

  if (rest === 'passkeys' && method === 'GET') return Response.json(await listPasskeys(db, accountId));

  if (passkey?.[1] !== undefined) {
    const result = await removePasskey(db, accountId, passkey[1]);
    if (result === 'last') {
      return Response.json({ error: 'Add another passkey before removing this one' }, { status: 409 });
    }
    return result === 'removed' ? new Response(null, { status: 204 }) : Response.json({ error: 'No such passkey' }, { status: 404 });
  }

  const rp = relyingPartyFor(request.headers.get('Origin'));
  if (!rp) return Response.json({ error: 'Passkeys only work on onthestack.gg' }, { status: 403 });
  const ctx = { db, rp, now: deps.now(), newId: deps.newId };

  if (rest === 'passkeys/options') {
    const account = await getAccount(db, accountId);
    const { challengeId, options } = await addPasskeyOptions(ctx, account!);
    return withCookies(Response.json(options), challengeCookie(request, challengeId));
  }

  const body = WithCredential.safeParse(await json(request));
  if (!body.success) return badRequest(body.error);
  const challenge = challengeId(request);
  const result = challenge
    ? await addPasskey(ctx, challenge, accountId, {
        response: body.data.response as unknown as RegistrationResponseJSON,
        label: deviceLabel(request.headers.get('User-Agent')),
      })
    : { error: 'That took too long. Try again.' };
  if ('error' in result) return withCookies(Response.json(result, { status: 400 }), clearedChallengeCookie(request));
  return withCookies(Response.json(await listPasskeys(db, accountId), { status: 201 }), clearedChallengeCookie(request));
}

async function handleCeremony(request: Request, rest: string, deps: AccountDeps): Promise<Response> {
  const rp = relyingPartyFor(request.headers.get('Origin'));
  if (!rp) return Response.json({ error: 'Passkeys only work on onthestack.gg' }, { status: 403 });
  const ctx = { db: deps.db, rp, now: deps.now(), newId: deps.newId };

  if (rest.endsWith('/options')) {
    if (!(await deps.limit(request.headers.get('CF-Connecting-IP') ?? 'unknown'))) {
      return Response.json({ error: 'Too many tries. Wait a minute and try again.' }, { status: 429 });
    }
    if (rest === 'sign-up/options') {
      const body = Profile.safeParse(await json(request));
      if (!body.success) return badRequest(body.error);
      const { challengeId, options } = await signUpOptions(ctx, body.data);
      return withCookies(Response.json(options), challengeCookie(request, challengeId));
    }
    const { challengeId, options } = await signInOptions(ctx);
    return withCookies(Response.json(options), challengeCookie(request, challengeId));
  }

  const challenge = challengeId(request);
  let result: { accountId: string } | Failure;
  if (rest === 'sign-up') {
    const body = SignUp.safeParse(await json(request));
    if (!body.success) return badRequest(body.error);
    result = challenge
      ? await signUp(ctx, challenge, {
          ...body.data,
          response: body.data.response as unknown as RegistrationResponseJSON,
          label: deviceLabel(request.headers.get('User-Agent')),
        })
      : { error: 'That took too long. Try again.' };
  } else {
    const body = WithCredential.safeParse(await json(request));
    if (!body.success) return badRequest(body.error);
    result = challenge
      ? await signIn(ctx, challenge, body.data.response as unknown as AuthenticationResponseJSON)
      : { error: 'That took too long. Try again.' };
  }

  if ('error' in result) return withCookies(Response.json(result, { status: 400 }), clearedChallengeCookie(request));
  const newToken = await startSession(deps.db, result.accountId, ctx.now);
  return withCookies(
    Response.json({ account: await getAccount(deps.db, result.accountId) }),
    sessionCookie(request, newToken),
    clearedChallengeCookie(request),
  );
}
