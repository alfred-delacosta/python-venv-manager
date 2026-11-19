/* Copyright Advanced Software and AI Solutions LLC */
import { describe, expect, it } from 'vitest';
import { renderLogAsText } from './logText.js';

describe('log text rendering', () => {
  it('keeps HTML payloads inert as plain text', () => {
    const raw = '<script>alert(1)</script>\nhello';
    const out = renderLogAsText(raw);
    // Same characters, meant for text nodes / <pre>, never HTML parsing.
    expect(out).toBe(raw);
    expect(typeof out).toBe('string');
  });
});
