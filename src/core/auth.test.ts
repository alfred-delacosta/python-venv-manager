/* Copyright Advanced Software and AI Solutions LLC */
import { describe, expect, it } from 'vitest';
import {
  clearFailures,
  createFailureTracker,
  hashPassword,
  isLockedOut,
  recordFailure,
  timingSafeEqualString,
  verifyPassword,
} from './auth.js';

describe('auth', () => {
  it('hashes and verifies with scrypt', () => {
    const record = hashPassword('correct horse');
    expect(verifyPassword('correct horse', record)).toBe(true);
    expect(verifyPassword('wrong', record)).toBe(false);
  });

  it('locks out after repeated failures', () => {
    const tracker = createFailureTracker();
    const key = 'ip:127.0.0.1';
    for (let i = 0; i < 5; i++) recordFailure(tracker, key, 1_000 + i);
    expect(isLockedOut(tracker, key, 1_100)).toBe(true);
    clearFailures(tracker, key);
    expect(isLockedOut(tracker, key, 1_100)).toBe(false);
  });

  it('compares strings in constant time length-safe way', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
    expect(timingSafeEqualString('abc', 'ab')).toBe(false);
  });
});
