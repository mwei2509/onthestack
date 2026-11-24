export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

export function setCookie(
  request: Request,
  name: string,
  value: string,
  { maxAgeSeconds, path = '/', sameSite = 'Lax' }: { maxAgeSeconds: number; path?: string; sameSite?: 'Lax' | 'Strict' },
): string {
  // Safari refuses `Secure` cookies over http://localhost, so local dev leaves it off; every deployed site is https.
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${secure}`;
}
