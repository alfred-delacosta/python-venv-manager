/* Copyright Advanced Software and AI Solutions LLC */
import { describe, expect, it } from 'vitest';
import { compareVersions, extractLatestVersion } from './updates.js';

describe('update checks', () => {
  it('compares versions', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(true);
    expect(compareVersions('1.2.0', '1.1.9')).toBe(false);
    expect(compareVersions(null, '1.0.0')).toBe(false);
  });

  it('extracts a version from uv output text', () => {
    expect(extractLatestVersion('1.0.0\n1.1.0\n1.2.3\n')).toBe('1.2.3');
  });
});
