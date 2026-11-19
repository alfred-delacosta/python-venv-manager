/* Copyright Advanced Software and AI Solutions LLC */
import { describe, expect, it, vi } from 'vitest';
import { motionDuration, prefersReducedMotion } from './motion.js';

describe('reduced motion', () => {
  it('turns transition durations off when reduced motion is preferred', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
    });
    expect(prefersReducedMotion()).toBe(true);
    expect(motionDuration(200)).toBe(0);
    vi.unstubAllGlobals();
  });
});
