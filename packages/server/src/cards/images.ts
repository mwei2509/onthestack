import { SCRYFALL_HEADERS } from './scryfall.js';

export const IMAGE_PATH = /^\/api\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/back)?$/;

// Stored URLs only ever come from Scryfall, but the route refuses anything else rather than fetch whatever D1 holds.
const SCRYFALL_IMAGE_HOST = 'https://cards.scryfall.io/';

const CACHE_FOREVER = 'public, max-age=31536000, immutable';

export interface ImageDeps {
  db: D1Database;
  bucket: R2Bucket;
  fetch: typeof fetch;
}

/** Serves a printing's image from R2, filling it from Scryfall the first time it's asked for (ADR 0044, 0071). */
export async function serveImage(scryfallId: string, back: boolean, { db, bucket, fetch }: ImageDeps): Promise<Response> {
  const key = back ? `${scryfallId}/back` : scryfallId;

  const cached = await bucket.get(key);
  if (cached) {
    return new Response(cached.body, {
      headers: { 'Content-Type': cached.httpMetadata?.contentType ?? 'image/webp', 'Cache-Control': CACHE_FOREVER },
    });
  }

  const row = await db
    .prepare('SELECT image_url, back_image_url FROM printings WHERE scryfall_id = ?')
    .bind(scryfallId)
    .first<{ image_url: string | null; back_image_url: string | null }>();
  const source = back ? row?.back_image_url : row?.image_url;
  if (!source?.startsWith(SCRYFALL_IMAGE_HOST)) return new Response('No image for that printing', { status: 404 });

  const res = await fetch(source, { headers: { 'User-Agent': SCRYFALL_HEADERS['User-Agent'] } });
  if (!res.ok) return new Response('Scryfall has no image for that printing right now', { status: 502 });
  const contentType = res.headers.get('Content-Type') ?? 'image/webp';
  const image = await res.arrayBuffer();
  await bucket.put(key, image, { httpMetadata: { contentType } });

  return new Response(image, { headers: { 'Content-Type': contentType, 'Cache-Control': CACHE_FOREVER } });
}
