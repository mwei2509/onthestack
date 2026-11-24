import { describe, expect, it } from 'vitest';
import { handleAutocomplete } from './autocomplete.js';

function scryfall(status = 200) {
  const asked: Request[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    asked.push(new Request(url, init));
    return status === 200
      ? Response.json({ object: 'catalog', data: ['Goldspan Dragon', 'Goldvein Hydra'] })
      : new Response('', { status });
  }) as typeof fetch;
  return { fetch: fetchImpl, asked };
}

const ask = (q: string, fetchImpl: typeof fetch) =>
  handleAutocomplete(new Request(`http://test/api/cards/autocomplete?q=${encodeURIComponent(q)}`), fetchImpl);

describe('card name suggestions', () => {
  it("passes Scryfall's suggestions on, cached for a day", async () => {
    const s = scryfall();
    const res = await ask(' Goldspan Dra ', s.fetch);
    expect(await res.json()).toEqual({ names: ['Goldspan Dragon', 'Goldvein Hydra'] });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(s.asked[0]!.url).toBe('https://api.scryfall.com/cards/autocomplete?q=Goldspan%20Dra');
    expect(s.asked[0]!.headers.get('User-Agent')).toMatch(/^OnTheStack\//);
  });

  it("doesn't ask Scryfall for fewer than two letters", async () => {
    const s = scryfall();
    expect(await (await ask('G', s.fetch)).json()).toEqual({ names: [] });
    expect(s.asked).toEqual([]);
  });

  it('answers 503 when Scryfall is down', async () => {
    expect((await ask('Gold', scryfall(500).fetch)).status).toBe(503);
  });
});
