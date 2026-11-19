/* Copyright Advanced Software and AI Solutions LLC */
import type { Db } from '../core/db.js';
import { nowIso } from '../core/db.js';
import { hashPassword, verifyPassword, type PasswordRecord } from '../core/auth.js';

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  password_salt: string;
};

export function getUser(db: Db): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = 1').get() as UserRow | undefined;
}

export function ensureAdminUser(
  db: Db,
  username: string,
  password: string | undefined,
): void {
  const existing = getUser(db);
  if (existing) return;
  if (!password) {
    throw new Error('ADMIN_PASSWORD is required on first run to create the admin account');
  }
  const record = hashPassword(password);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, password_salt, created_at)
     VALUES (1, ?, ?, ?, ?)`,
  ).run(username, record.hash, record.salt, nowIso());
}

export function resetAdminPassword(db: Db, password: string): void {
  const record = hashPassword(password);
  const user = getUser(db);
  if (!user) {
    throw new Error('Admin user does not exist yet; start the server once with ADMIN_PASSWORD set');
  }
  db.prepare(
    `UPDATE users SET password_hash = ?, password_salt = ? WHERE id = 1`,
  ).run(record.hash, record.salt);
}

export function authenticate(
  db: Db,
  username: string,
  password: string,
): UserRow | null {
  const user = getUser(db);
  if (!user) return null;
  if (user.username !== username) {
    // Still run a dummy verify timing-ish path
    verifyPassword(password, { hash: user.password_hash, salt: user.password_salt });
    return null;
  }
  const record: PasswordRecord = {
    hash: user.password_hash,
    salt: user.password_salt,
  };
  return verifyPassword(password, record) ? user : null;
}
