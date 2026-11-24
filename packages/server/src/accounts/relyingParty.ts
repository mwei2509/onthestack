export interface RelyingParty {
  id: string;
  origin: string;
}

const PREVIEW = /^https:\/\/[a-z0-9-]+\.onthestack\.workers\.dev$/;
const LOCALHOST = /^http:\/\/localhost(:\d{1,5})?$/;

/** The site a passkey belongs to, from the request's Origin; null for any origin but ours (ADR 0103). */
export function relyingPartyFor(origin: string | null): RelyingParty | null {
  if (origin === 'https://onthestack.gg') return { id: 'onthestack.gg', origin };
  if (origin && LOCALHOST.test(origin)) return { id: 'localhost', origin };
  if (origin && PREVIEW.test(origin)) return { id: 'onthestack.workers.dev', origin };
  return null;
}
