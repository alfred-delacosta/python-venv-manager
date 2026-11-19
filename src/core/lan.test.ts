/* Copyright Advanced Software and AI Solutions LLC */
import { describe, expect, it } from 'vitest';
import { assertBindHost, ipInCidr, isClientAllowed, LanError } from './lan.js';

describe('lan guards', () => {
  it('matches ALLOWED_CIDRS', () => {
    expect(ipInCidr('127.0.0.1', '127.0.0.0/8')).toBe(true);
    expect(ipInCidr('10.0.0.5', '10.0.0.0/8')).toBe(true);
    expect(ipInCidr('8.8.8.8', '10.0.0.0/8')).toBe(false);
    expect(isClientAllowed('192.168.1.20', ['192.168.0.0/16'])).toBe(true);
    expect(isClientAllowed('1.2.3.4', ['192.168.0.0/16', '127.0.0.0/8'])).toBe(false);
  });

  it('refuses public or all-interface binds by default', () => {
    expect(() => assertBindHost('8.8.8.8', false)).toThrow(LanError);
    expect(() => assertBindHost('0.0.0.0', false)).toThrow(LanError);
    expect(() => assertBindHost('0.0.0.0', true)).not.toThrow();
    expect(() => assertBindHost('127.0.0.1', false)).not.toThrow();
    expect(() => assertBindHost('192.168.1.10', false)).not.toThrow();
  });
});
