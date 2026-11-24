import { describe, expect, it } from 'vitest';
import { fakeScryfall } from './fake-scryfall.js';
import fixture from './scryfall-fixture.json';
import { fetchCollection, printingOf, ScryfallUnavailable, trimCard, type ScryfallCard } from './scryfall.js';

const [solRing, vona, brightclimb] = fixture as ScryfallCard[];

describe('fetchCollection', () => {
  it('sends 75 identifiers per request, half a second apart, with the headers Scryfall requires', async () => {
    const scryfall = fakeScryfall();
    const sleeps: number[] = [];
    const names = Array.from({ length: 80 }, (_, i) => ({ name: `Card ${i}` }));

    await fetchCollection(names, scryfall.fetch, async (ms) => void sleeps.push(ms));

    expect(scryfall.requests.map((r) => r.identifiers.length)).toEqual([75, 5]);
    expect(sleeps).toEqual([500]);
    expect(scryfall.requests[0]!.headers.get('User-Agent')).toMatch(/^OnTheStack\//);
    expect(scryfall.requests[0]!.headers.get('Accept')).toBe('application/json');
  });

  it('fails when Scryfall does', async () => {
    const scryfall = fakeScryfall(503);
    await expect(fetchCollection([{ name: 'Sol Ring' }], scryfall.fetch, async () => {})).rejects.toThrow(
      ScryfallUnavailable,
    );
  });
});

describe('trimCard', () => {
  it("keeps the fields the app uses, under Scryfall's names", () => {
    expect(trimCard(vona!)).toEqual({
      name: 'Vona, Butcher of Magan',
      mana_cost: vona!.mana_cost,
      cmc: 5,
      type_line: 'Legendary Creature — Vampire Knight',
      oracle_text: vona!.oracle_text,
      power: '4',
      toughness: '4',
      keywords: ['Lifelink', 'Vigilance'],
      colors: ['B', 'W'],
      color_identity: ['B', 'W'],
      layout: 'normal',
    });
  });

  it('keeps both faces of a double-faced card, without their images', () => {
    const faces = trimCard(brightclimb!).card_faces!;
    expect(faces.map((f) => f.name)).toEqual(['Brightclimb Pathway', 'Grimclimb Pathway']);
    expect(faces[0]).not.toHaveProperty('image_uris');
  });
});

describe('printingOf', () => {
  it("takes a single-faced card's grid image from the card", () => {
    expect(printingOf(solRing!, solRing!.oracle_id!)).toMatchObject({
      imageUrl: solRing!.image_uris!.grid,
      backImageUrl: null,
    });
  });

  it("takes a double-faced card's grid images from its faces", () => {
    const printing = printingOf(brightclimb!, brightclimb!.oracle_id!);
    expect(printing.imageUrl).toBe(brightclimb!.card_faces![0]!.image_uris!.grid);
    expect(printing.backImageUrl).toBe(brightclimb!.card_faces![1]!.image_uris!.grid);
  });
});
