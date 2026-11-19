/* Copyright Advanced Software and AI Solutions LLC */
import crypto from 'node:crypto';
import { LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS, SESSION_IDLE_MS } from './config.js';

export type PasswordRecord = {
  hash: string;
  salt: string;
};

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): PasswordRecord {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, record: PasswordRecord): boolean {
  const hash = crypto.scryptSync(password, record.salt, 64);
  const expected = Buffer.from(record.hash, 'hex');
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(hash, expected);
}

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function createCsrfToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export type FailureTracker = {
  failures: Map<string, number[]>;
};

export function createFailureTracker(): FailureTracker {
  return { failures: new Map() };
}

function prune(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => now - t < LOGIN_WINDOW_MS);
}

export function isLockedOut(tracker: FailureTracker, key: string, now = Date.now()): boolean {
  const list = prune(tracker.failures.get(key) ?? [], now);
  tracker.failures.set(key, list);
  return list.length >= LOGIN_MAX_FAILURES;
}

export function recordFailure(tracker: FailureTracker, key: string, now = Date.now()): void {
  const list = prune(tracker.failures.get(key) ?? [], now);
  list.push(now);
  tracker.failures.set(key, list);
}

export function clearFailures(tracker: FailureTracker, key: string): void {
  tracker.failures.delete(key);
}

export function sessionExpired(lastSeenAt: number, now = Date.now()): boolean {
  return now - lastSeenAt > SESSION_IDLE_MS;
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
