import { describe, expect, it } from 'vitest';
import { formatJoinCode, joinCodeDigits } from './joinCode.js';

describe('join codes', () => {
  it('reads as two halves', () => {
    expect(formatJoinCode('482913')).toBe('482 913');
    expect(formatJoinCode('48')).toBe('48');
    expect(formatJoinCode('4829')).toBe('482 9');
  });

  it('keeps only the first six digits of whatever is typed or pasted', () => {
    expect(joinCodeDigits('482 913')).toBe('482913');
    expect(joinCodeDigits('code: 48-29-13-77')).toBe('482913');
    expect(joinCodeDigits('abc')).toBe('');
  });
});
