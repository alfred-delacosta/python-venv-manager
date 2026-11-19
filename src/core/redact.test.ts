/* Copyright Advanced Software and AI Solutions LLC */
import { describe, expect, it } from 'vitest';
import { appendCappedLog, redactSecrets } from './redact.js';

describe('redact', () => {
  it('redacts secrets and never leaves password material', () => {
    const text = 'ADMIN_PASSWORD=super-secret cookie: session=abc password: hunter2';
    const out = redactSecrets(text);
    expect(out).not.toContain('super-secret');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('[REDACTED]');
  });

  it('caps log size', () => {
    const out = appendCappedLog('a'.repeat(100), 'b'.repeat(100), 50);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(50);
  });
});
