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
  const prompt = buildPrompt({ turnStart, statements, currentStep: 'declareBlockers', oracleText: (c) => (c === 'Serra Angel' ? 'Flying, vigilance' : undefined) });

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

  it('includes Oracle text where the app has it', () => {
    expect(prompt.user).toContain('- Serra Angel: Creature; 4/4; Flying, Vigilance\n    Flying, vigilance');
    expect(prompt.user).toContain('- Plains: Land\n');
  });

  it('says where the table is now', () => {
    expect(prompt.user).toContain('The table is now in: declareBlockers.');
  });
});
