import { handleAccount, type AccountDeps } from './routes.js';

export type TestBrowser = (rest: string, body?: unknown, method?: string) => Promise<Response>;

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Safari/604.1';

/** Sends `/api/account/<rest>` requests and keeps the cookies they set, like a real browser keeps the challenge and session. */
export function testBrowser(deps: AccountDeps, origin: string, userAgent = IPHONE_SAFARI): TestBrowser {
  const jar = new Map<string, string>();
  return async (rest, body, method = 'POST') => {
    const res = await handleAccount(
      new Request(`${origin}/api/account${rest ? `/${rest}` : ''}`, {
        method,
        headers: {
          Origin: origin,
          'User-Agent': userAgent,
          Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      rest === '' ? undefined : rest,
      deps,
    );
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const [name, value] = pair!.split('=');
      if (value) jar.set(name!, value);
      else jar.delete(name!);
    }
    return res;
  };
}
