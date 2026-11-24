import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { serveImage } from './images.js';

const PRINTING = 'd24c3d51-795d-4c01-a34a-3280fccd2d78';
const FRONT = `https://cards.scryfall.io/grid/front/d/2/${PRINTING}.webp?1`;
const BACK = `https://cards.scryfall.io/grid/back/d/2/${PRINTING}.webp?1`;

function imageHost() {
  const fetched: string[] = [];
  const fetchImpl = (async (url: string) => {
    fetched.push(url);
    return new Response(`image of ${url}`, { headers: { 'Content-Type': 'image/webp' } });
  }) as typeof fetch;
  return { fetch: fetchImpl, fetched };
}

async function storePrinting(imageUrl: string | null, backImageUrl: string | null) {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO cards (oracle_id, name, data, fetched_at) VALUES ('o1', 'Brightclimb Pathway', '{}', 'now')"),
    env.DB.prepare(
      "INSERT INTO printings (scryfall_id, oracle_id, set_code, collector_number, image_url, back_image_url) VALUES (?, 'o1', 'znr', '259', ?, ?)",
    ).bind(PRINTING, imageUrl, backImageUrl),
  ]);
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM printings'), env.DB.prepare('DELETE FROM cards')]);
  const listed = await env.IMAGES.list();
  await env.IMAGES.delete(listed.objects.map((o) => o.key));
});

describe('card images', () => {
  it('fills an image from Scryfall once, then serves it from R2', async () => {
    await storePrinting(FRONT, BACK);
    const host = imageHost();
    const deps = { db: env.DB, bucket: env.IMAGES, fetch: host.fetch };

    const first = await serveImage(PRINTING, false, deps);
    const second = await serveImage(PRINTING, false, deps);

    expect(await first.text()).toBe(`image of ${FRONT}`);
    expect(await second.text()).toBe(`image of ${FRONT}`);
    expect(second.headers.get('Content-Type')).toBe('image/webp');
    expect(second.headers.get('Cache-Control')).toContain('immutable');
    expect(host.fetched).toEqual([FRONT]);
  });

  it("serves a double-faced card's back image from its own path", async () => {
    await storePrinting(FRONT, BACK);
    const host = imageHost();

    const res = await serveImage(PRINTING, true, { db: env.DB, bucket: env.IMAGES, fetch: host.fetch });

    expect(await res.text()).toBe(`image of ${BACK}`);
    expect(await env.IMAGES.head(`${PRINTING}/back`)).not.toBeNull();
  });

  it("answers 404 for a printing it doesn't know, a missing back, or a missing image", async () => {
    const host = imageHost();
    const deps = { db: env.DB, bucket: env.IMAGES, fetch: host.fetch };
    expect((await serveImage(PRINTING, false, deps)).status).toBe(404);

    await storePrinting(null, null);
    expect((await serveImage(PRINTING, false, deps)).status).toBe(404);
    expect((await serveImage(PRINTING, true, deps)).status).toBe(404);
    expect(host.fetched).toEqual([]);
  });

  it('refuses to fetch an image from anywhere but Scryfall', async () => {
    await storePrinting('https://example.com/not-scryfall.webp', null);
    const host = imageHost();

    expect((await serveImage(PRINTING, false, { db: env.DB, bucket: env.IMAGES, fetch: host.fetch })).status).toBe(404);
    expect(host.fetched).toEqual([]);
  });

  it('is routed under /api/images', async () => {
    const res = await exports.default.fetch(`http://test/api/images/${PRINTING}/back`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('No image for that printing');
    expect((await exports.default.fetch('http://test/api/images/not-a-printing')).status).toBe(404);
  });
});
