import { createGame, replayTurn, type CardDefinition, type PlayerStatement } from '@onthestack/engine';
import { describe, expect, it } from 'vitest';
import { buildPrompt } from './prompt.js';

const cards: Record<string, CardDefinition> = {
  Plains: { name: 'Plains', types: ['Land'], abilities: [] },
  'Serra Angel': { name: 'Serra Angel', types: ['Creature'], power: 4, toughness: 4, keywords: ['Flying', 'Vigilance'], abilities: [] },
};
const start = createGame(
  [
    { id: 'theo', name: 'Theo', commander: 'Teysa Karlov' },
    { id: 'melissa', name: 'Melissa' },
  ],
  cards,
);
const turnStart = replayTurn(start, [
  { step: 'main1', playerId: 'theo', gameAction: { type: 'playLand', card: 'Plains' }, from: ['s0'] },
  { step: 'main1', playerId: 'theo', gameAction: { type: 'tap', permanentId: 'p1' }, from: ['s0'] },
  { step: 'main1', playerId: 'theo', gameAction: { type: 'cast', card: 'Serra Angel' }, from: ['s0'] },
  { step: 'main1', playerId: 'theo', gameAction: { type: 'counters', target: { permanentId: 'p2' }, kind: '+1/+1', delta: 1 }, from: ['s0'] },
]).state;

const statements: PlayerStatement[] = [
  { id: 's2', playerId: 'melissa', pressedAt: '2026-11-22T20:00:05Z', text: 'No blocks.' },
  { id: 's1', playerId: 'theo', pressedAt: '2026-11-22T20:00:01Z', text: 'Serra Angel attacks Melissa.' },
];

describe('buildPrompt', () => {
  const prompt = buildPrompt({ turnStart, statements, currentStep: 'declareBlockers' });

  it('keeps the system prompt identical across requests, so it can be cached', () => {
    const other = buildPrompt({ turnStart: start, statements: [], currentStep: 'untap' });
    expect(other.system).toBe(prompt.system);
  });

  it('tells the model to ask rather than guess, and never to suggest plays (ADR 0043)', () => {
    expect(prompt.system).toContain('Never guess');
    expect(prompt.system).toContain('Never suggest a play');
    expect(prompt.system).toContain('whichStep');
  });

  it('lists the transcript in button-press order, with ids and speakers', () => {
    const theo = prompt.user.indexOf('[s1] Theo (theo): "Serra Angel attacks Melissa."');
    const melissa = prompt.user.indexOf('[s2] Melissa (melissa): "No blocks."');
    expect(theo).toBeGreaterThan(-1);
    expect(melissa).toBeGreaterThan(theo);
  });

  it('summarises the board with current stats, tapped state and counters', () => {
    expect(prompt.user).toContain('- Plains (tapped)');
    expect(prompt.user).toContain('- Serra Angel (5/5; Flying, Vigilance; 1 +1/+1 counter)');
    expect(prompt.user).toContain('melissa controls: nothing');
    expect(prompt.user).toContain('commander Teysa Karlov (in the command zone)');
  });

  it("lists the engine's cards in the user message when the game has no Deck cards", () => {
    expect(prompt.user).toContain('Cards in this game:\n- Plains: Land\n- Serra Angel: Creature; 4/4; Flying, Vigilance');
    expect(prompt.cards).toBeUndefined();
  });

  describe("the game's Deck cards (ADR 0121)", () => {
    const deckCards = {
      'Serra Angel': { typeLine: 'Creature — Angel', oracleText: 'Flying, vigilance' },
      Plains: { typeLine: 'Basic Land — Plains', oracleText: '({T}: Add {W}.)' },
    };
    const withTokens = { ...turnStart, cards: { ...turnStart.cards, Soldier: { name: 'Soldier', types: ['Creature'], power: 1, toughness: 1, abilities: [] } } };
    const carded = buildPrompt({ turnStart: withTokens, statements, currentStep: 'declareBlockers', deckCards });

    it('go in a block of their own, every card in full and sorted by name', () => {
      expect(carded.cards).toContain('- Plains — Basic Land — Plains\n    ({T}: Add {W}.)\n- Serra Angel — Creature — Angel — 4/4\n    Flying, vigilance');
      expect(carded.user).not.toContain('Flying, vigilance\n');
    });

    it("stay the same all game, whatever the board, the statements or the tokens, so the block can be cached", () => {
      const later = buildPrompt({ turnStart: start, statements: [], currentStep: 'untap', deckCards });
      expect(later.cards).toBe(carded.cards);
      expect(later.cardsVersion).toBe(carded.cardsVersion);
      expect(carded.cardsVersion).toMatch(/^[0-9a-f]{8}$/);
    });

    it('leave only cards on no Deck, like tokens, in the user message', () => {
      expect(carded.user).toContain('Other cards in this game, not on any Deck (tokens):\n- Soldier: Creature; 1/1');
      expect(carded.user).not.toContain('- Serra Angel: Creature');
    });

    it('say when a power or toughness varies instead of printing a number', () => {
      const goyf = { ...start, cards: { Tarmogoyf: { name: 'Tarmogoyf', types: ['Creature'], power: 0, toughness: 1, ptVaries: true, abilities: [] } } };
      const p = buildPrompt({ turnStart: goyf, statements: [], currentStep: 'main1', deckCards: { Tarmogoyf: { typeLine: 'Creature — Lhurgoyf', oracleText: '' } } });
      expect(p.cards).toContain('- Tarmogoyf — Creature — Lhurgoyf — power/toughness varies');
    });
  });

  it('says where the table is now', () => {
    expect(prompt.user).toContain('The table is now in: declareBlockers.');
  });

  it('lists tapped actions as already recorded, and tells the model never to add them (ADR 0065)', () => {
    const withTap = buildPrompt({
      turnStart,
      statements,
      currentStep: 'declareBlockers',
      pinned: [{ entry: { step: 'declareBlockers', playerId: 'melissa', gameAction: { type: 'life', playerId: 'melissa', delta: -4 }, from: [] }, afterStatements: 1 }],
    });
    expect(withTap.user).toContain('Already recorded by a tap on the board (never add these):\n- melissa lost 4 life (tapped by Melissa, after [s1], in declareBlockers)');
    expect(withTap.system).toBe(prompt.system);
    expect(prompt.system).toContain('never add an entry for them');
    expect(prompt.user).not.toContain('Already recorded');
  });

  it('lists the questions players were shown, so a short answer can settle one (ADR 0068)', () => {
    const withQuestion = buildPrompt({
      turnStart,
      statements,
      currentStep: 'declareBlockers',
      openQuestions: [{ kind: 'chooseOption', askPlayer: 'melissa', text: 'Did you say Serra Angel or Savannah Lions?', about: ['s2'], options: ['Serra Angel', 'Savannah Lions'] }],
    });
    expect(withQuestion.user).toContain(
      'Questions you asked last time, still open (a later statement may answer one):\n- To Melissa (melissa), about [s2], chooseOption: "Did you say Serra Angel or Savannah Lions?" Options: Serra Angel / Savannah Lions.',
    );
    expect(prompt.user).not.toContain('Questions you asked');
  });
});

describe('the prompt version', () => {
  it('names the system prompt, not the turn', () => {
    const a = buildPrompt({ turnStart: createGame([{ id: 'p1', name: 'Theo' }]), statements: [], currentStep: 'upkeep' });
    const b = buildPrompt({ turnStart: createGame([{ id: 'p2', name: 'Elena' }]), statements: [], currentStep: 'main1' });
    expect(a.version).toMatch(/^[0-9a-f]{8}$/);
    expect(b.version).toBe(a.version);
    expect(b.user).not.toBe(a.user);
  });
});

describe('answers', () => {
  it('shows the question a statement answers, so a later re-read still knows what "Yes" meant (ADR 0114)', () => {
    const prompt = buildPrompt({
      turnStart: createGame([{ id: 'p1', name: 'melissa' }]),
      statements: [{ id: 's1', playerId: 'p1', pressedAt: '2026-11-24T21:00:00Z', text: 'Yes', answering: 'Did you play a second Godless Shrine?' }],
      currentStep: 'main1',
    });
    expect(prompt.user).toContain('[s1] melissa (p1), answering "Did you play a second Godless Shrine?": "Yes"');
  });
});
