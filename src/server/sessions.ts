/* Copyright Advanced Software and AI Solutions LLC */
import type { Db } from '../core/db.js';
import { nowIso } from '../core/db.js';
import {
  createCsrfToken,
  createSessionToken,
  hashToken,
  sessionExpired,
} from '../core/auth.js';

export type SessionRow = {
  id: string;
  token_hash: string;
  csrf_token: string;
  created_at: string;
  last_seen_at: string;
  ip: string | null;
};

export function createSession(
  db: Db,
  secret: string,
  ip?: string,
): { token: string; csrf: string; row: SessionRow } {
  const token = createSessionToken();
  const csrf = createCsrfToken();
  const id = createSessionToken();
  const ts = nowIso();
  const tokenHash = hashToken(token, secret);
  db.prepare(
    `INSERT INTO sessions (id, token_hash, csrf_token, created_at, last_seen_at, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, tokenHash, csrf, ts, ts, ip ?? null);
  return {
    token,
    csrf,
    row: {
      id,
      token_hash: tokenHash,
      csrf_token: csrf,
      created_at: ts,
      last_seen_at: ts,
      ip: ip ?? null,
    },
  };
}

export function findSession(
  db: Db,
  secret: string,
  token: string | undefined,
): SessionRow | undefined {
  if (!token) return undefined;
  const tokenHash = hashToken(token, secret);
  return db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash) as
    | SessionRow
    | undefined;
}

export function touchSession(db: Db, sessionId: string): void {
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), sessionId);
}

export function destroySession(db: Db, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function rotateSession(
  db: Db,
  secret: string,
  oldSessionId: string | undefined,
  ip?: string,
): { token: string; csrf: string } {
  if (oldSessionId) destroySession(db, oldSessionId);
  const created = createSession(db, secret, ip);
  return { token: created.token, csrf: created.csrf };
}

export function validateSession(session: SessionRow | undefined): SessionRow | undefined {
  if (!session) return undefined;
  const lastSeen = Date.parse(session.last_seen_at);
  if (Number.isNaN(lastSeen) || sessionExpired(lastSeen)) {
    return undefined;
  }
  return session;
}
