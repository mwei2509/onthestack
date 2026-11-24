import { getAccount } from './store.js';
import { clearedSessionCookie, endAllSessions, endSession, findSession, sessionCookie, sessionToken } from './sessions.js';

export const ACCOUNT_PATH = /^\/api\/account(?:\/([a-z0-9/-]{1,120}))?$/;

const notFound = () => new Response('Not found', { status: 404 });

function withCookie(response: Response, cookie: string): Response {
  response.headers.append('Set-Cookie', cookie);
  return response;
}

/** `/api/account` (who is signed in), `/api/account/sign-out` and `/api/account/sign-out-everywhere`. */
export async function handleAccount(
  request: Request,
  rest: string | undefined,
  { db, now }: { db: D1Database; now: () => Date },
): Promise<Response> {
  const token = sessionToken(request);
  const session = token ? await findSession(db, token, now()) : null;

  if (rest === undefined && request.method === 'GET') {
    const account = session ? await getAccount(db, session.accountId) : null;
    const response = Response.json({ account });
    if (token && !account) return withCookie(response, clearedSessionCookie(request));
    return session?.renewed ? withCookie(response, sessionCookie(request, token!)) : response;
  }

  if (rest === 'sign-out' && request.method === 'POST') {
    if (token) await endSession(db, token);
    return withCookie(new Response(null, { status: 204 }), clearedSessionCookie(request));
  }

  if (rest === 'sign-out-everywhere' && request.method === 'POST') {
    if (!session) return Response.json({ error: 'Not signed in' }, { status: 401 });
    await endAllSessions(db, session.accountId);
    return withCookie(new Response(null, { status: 204 }), clearedSessionCookie(request));
  }

  return notFound();
}
