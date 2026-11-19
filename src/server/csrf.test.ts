/* Copyright Advanced Software and AI Solutions LLC */
import { describe, expect, it } from 'vitest';
import { createCsrfToken, timingSafeEqualString } from '../core/auth.js';

describe('csrf tokens', () => {
  it('creates opaque tokens that only match via timing-safe compare', () => {
    const a = createCsrfToken();
    const b = createCsrfToken();
    expect(a).not.toBe(b);
    expect(timingSafeEqualString(a, a)).toBe(true);
    expect(timingSafeEqualString(a, b)).toBe(false);
  });
});
