import { describe, expect, it } from 'vitest';
import { relyingPartyFor } from './relyingParty.js';

describe('relyingPartyFor', () => {
  it('accepts onthestack.gg, localhost and Previews', () => {
    expect(relyingPartyFor('https://onthestack.gg')).toEqual({ id: 'onthestack.gg', origin: 'https://onthestack.gg' });
    expect(relyingPartyFor('http://localhost:5190')).toEqual({ id: 'localhost', origin: 'http://localhost:5190' });
    expect(relyingPartyFor('http://localhost')?.id).toBe('localhost');
    expect(relyingPartyFor('https://pr-76-onthestack.onthestack.workers.dev')?.id).toBe('onthestack.workers.dev');
  });

  it('refuses anything else', () => {
    for (const origin of [
      null,
      'http://onthestack.gg',
      'https://evil.gg',
      'https://onthestack.gg.evil.gg',
      'https://localhost',
      'http://localhost.evil.gg',
      'https://a.b.onthestack.workers.dev',
      'https://other.workers.dev',
    ]) {
      expect(relyingPartyFor(origin)).toBeNull();
    }
  });
});
