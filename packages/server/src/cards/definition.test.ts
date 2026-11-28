import { describe, expect, it } from 'vitest';
import { cardDefinition, cardText } from './definition.js';
import fixture from './scryfall-fixture.json';
import { trimCard, type CardData, type ScryfallCard } from './scryfall.js';

const [solRing, vona, brightclimb, delver] = (fixture as ScryfallCard[]).map(trimCard);

// Shaped like the card store's trimmed data (ADR 0070). The Oracle text is written out for these tests, not copied
// from Scryfall; only its structure (keyword lines, faces, `*`) matters here.
const akromasMemorial: CardData = {
  name: "Akroma's Memorial",
  mana_cost: '{7}',
  cmc: 7,
  type_line: 'Legendary Artifact',
  oracle_text: 'Legendary creatures you control have flying, first strike, vigilance, trample, haste, and protection from black and from red.',
  keywords: ['Flying', 'First strike', 'Vigilance', 'Trample', 'Haste', 'Protection'],
  color_identity: [],
  layout: 'normal',
};
const tarmogoyf: CardData = {
  name: 'Tarmogoyf',
  mana_cost: '{1}{G}',
  cmc: 2,
  type_line: 'Creature — Lhurgoyf',
  oracle_text: "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.",
  power: '*',
  toughness: '1+*',
  keywords: [],
  color_identity: ['G'],
  layout: 'normal',
};
const bonecrusher: CardData = {
  name: 'Bonecrusher Giant // Stomp',
  mana_cost: '{2}{R} // {1}{R}',
  cmc: 3,
  type_line: 'Creature — Giant // Instant — Adventure',
  keywords: [],
  color_identity: ['R'],
  layout: 'adventure',
  card_faces: [
    { name: 'Bonecrusher Giant', mana_cost: '{2}{R}', type_line: 'Creature — Giant', oracle_text: 'Whenever Bonecrusher Giant becomes the target of a spell, Bonecrusher Giant deals 2 damage to that spell\'s controller.', power: '4', toughness: '3' },
    { name: 'Stomp', mana_cost: '{1}{R}', type_line: 'Instant — Adventure', oracle_text: 'Damage can\'t be prevented this turn. Stomp deals 2 damage to any target.' },
  ],
};
const sireOfSevenDeaths: CardData = {
  name: 'Sire of Seven Deaths',
  mana_cost: '{7}',
  cmc: 7,
  type_line: 'Creature — Eldrazi',
  oracle_text: 'First strike, vigilance\nMenace, trample\nReach, lifelink\nWard—Pay 7 life.',
  power: '7',
  toughness: '7',
  keywords: ['First strike', 'Vigilance', 'Menace', 'Trample', 'Reach', 'Lifelink', 'Ward'],
  color_identity: [],
  layout: 'normal',
};

describe('cardDefinition (ADR 0120)', () => {
  it('reads types, subtypes, legendary, power and toughness, cost, mana value, colours and colour identity', () => {
    expect(cardDefinition(vona!)).toEqual({
      name: 'Vona, Butcher of Magan',
      types: ['Creature'],
      subtypes: ['Vampire', 'Knight'],
      legendary: true,
      cost: '{3}{W}{B}',
      manaValue: 5,
      power: 4,
      toughness: 4,
      keywords: ['Lifelink', 'Vigilance'],
      colors: ['W', 'B'],
      colorIdentity: ['W', 'B'],
      abilities: [],
    });
    expect(cardDefinition(solRing!)).toMatchObject({ types: ['Artifact'], manaValue: 1, colors: [], colorIdentity: [] });
  });

  it('keeps only the keywords a card has itself, not ones it grants to others', () => {
    expect(cardDefinition(akromasMemorial).keywords).toBeUndefined();
    expect(cardDefinition(sireOfSevenDeaths).keywords).toEqual(['First strike', 'Vigilance', 'Menace', 'Trample', 'Reach', 'Lifelink', 'Ward']);
  });

  it('marks a power or toughness printed with * as varying, never 0', () => {
    expect(cardDefinition(tarmogoyf)).toMatchObject({ power: 0, toughness: 1, ptVaries: true });
    expect(cardDefinition(vona!).ptVaries).toBeUndefined();
  });

  it("keys a double-faced card by its full name, with its front face's types and both faces kept", () => {
    expect(cardDefinition(delver!)).toMatchObject({
      name: 'Delver of Secrets // Insectile Aberration',
      types: ['Creature'],
      subtypes: ['Human', 'Wizard'],
      power: 1,
      toughness: 1,
      faces: [
        { name: 'Delver of Secrets', types: ['Creature'], subtypes: ['Human', 'Wizard'], power: 1, toughness: 1 },
        { name: 'Insectile Aberration', types: ['Creature'], subtypes: ['Human', 'Insect'], power: 3, toughness: 2 },
      ],
    });
    expect(cardDefinition(delver!).keywords).toBeUndefined();
    expect(cardDefinition(brightclimb!)).toMatchObject({ types: ['Land'], faces: [{ types: ['Land'] }, { types: ['Land'] }] });
  });

  it("gives an adventure card its creature's types and stats, and the adventure as a face", () => {
    expect(cardDefinition(bonecrusher)).toMatchObject({
      name: 'Bonecrusher Giant // Stomp',
      types: ['Creature'],
      cost: '{2}{R} // {1}{R}',
      power: 4,
      toughness: 3,
      faces: [{ name: 'Bonecrusher Giant' }, { name: 'Stomp', types: ['Instant'], subtypes: ['Adventure'] }],
    });
  });
});

describe('cardText', () => {
  it("is the type line and Oracle text, with each face's text labelled by its name", () => {
    expect(cardText(tarmogoyf)).toEqual({ typeLine: 'Creature — Lhurgoyf', oracleText: tarmogoyf.oracle_text });
    expect(cardText(bonecrusher)).toEqual({
      typeLine: 'Creature — Giant // Instant — Adventure',
      oracleText: `Bonecrusher Giant: ${bonecrusher.card_faces![0]!.oracle_text}\nStomp: ${bonecrusher.card_faces![1]!.oracle_text}`,
    });
  });
});
