import type { CardDefinition } from '@onthestack/engine';
import type { DeckCardText } from '../../prompt.js';
import { before, card, CARDS, conversation, entry, table, type EvalCase } from '../case.js';

// The table's Decks, as the game would load them (ADR 0119). The Oracle text is written for these cases, close to
// the printed cards; only what it lets the interpreter recognise matters.
const DECK_CARDS: Record<string, CardDefinition> = {
  ...CARDS,
  "Akroma's Memorial": card("Akroma's Memorial", ['Artifact']),
  'Swords to Plowshares': card('Swords to Plowshares', ['Instant']),
  'Brightclimb Pathway // Grimclimb Pathway': {
    ...card('Brightclimb Pathway // Grimclimb Pathway', ['Land']),
    faces: [
      { name: 'Brightclimb Pathway', types: ['Land'] },
      { name: 'Grimclimb Pathway', types: ['Land'] },
    ],
  },
};

const TEXT: Record<string, DeckCardText> = {
  "Akroma's Memorial": { typeLine: 'Legendary Artifact', oracleText: 'Legendary creatures you control have flying, first strike, vigilance, trample, haste, and protection from black and from red.' },
  'Swords to Plowshares': { typeLine: 'Instant', oracleText: 'Exile target creature. Its controller gains life equal to its power.' },
  'Brightclimb Pathway // Grimclimb Pathway': { typeLine: 'Land // Land', oracleText: 'Brightclimb Pathway: {T}: Add {W}.\nGrimclimb Pathway: {T}: Add {B}.' },
};

const deckCards: Record<string, DeckCardText> = Object.fromEntries(
  Object.values(DECK_CARDS).map((c) => [c.name, TEXT[c.name] ?? { typeLine: c.types.join(' '), oracleText: '' }]),
);

export const cards: EvalCase[] = [
  {
    id: 'card-name-without-punctuation',
    checks: "a card said without its apostrophe is recorded under the Deck's exact name (ADR 0121)",
    turnStart: table('theo', [], DECK_CARDS),
    deckCards,
    statements: conversation(['theo', 'I cast Akromas Memorial.']),
    currentStep: 'main1',
    expected: { entries: [entry('main1', 'theo', { type: 'cast', card: "Akroma's Memorial" }, ['s1'])] },
  },
  {
    id: 'land-by-its-back-face',
    checks: 'a two-faced land played by its back face is the Deck card (ADR 0120, 0121)',
    turnStart: table('theo', [], DECK_CARDS),
    deckCards,
    statements: conversation(['theo', 'Grimclimb Pathway, black side up.']),
    currentStep: 'main1',
    expected: { entries: [entry('main1', 'theo', { type: 'playLand', card: 'Brightclimb Pathway // Grimclimb Pathway' }, ['s1'])] },
  },
  {
    id: 'named-spell-effect-not-said',
    checks: "a spell whose text the interpreter can now read still gets no effects the player didn't say (ADR 0013, 0121)",
    turnStart: table('theo', [before('michael', { type: 'cast', card: 'Grizzly Bears' })], DECK_CARDS),
    deckCards,
    statements: conversation(['theo', "Swords on Michael's bears."]),
    currentStep: 'main1',
    expected: {
      entries: [entry('main1', 'theo', { type: 'cast', card: 'Swords to Plowshares', targets: [{ card: 'Grizzly Bears', controller: 'michael' }] }, ['s1'])],
    },
  },
];
