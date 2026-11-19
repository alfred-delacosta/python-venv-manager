/* Copyright Advanced Software and AI Solutions LLC */
import type { Db } from './db.js';

export type AuditRow = {
  id: number;
  who: string;
  action: string;
  result: string;
  details: string | null;
  ip: string | null;
  created_at: string;
};

export type AuditFilter = {
  action?: string;
  result?: string;
  ip?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export function listAudit(db: Db, filter: AuditFilter = {}): { rows: AuditRow[]; total: number } {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (filter.action) {
    where.push('action LIKE ?');
    params.push(`%${filter.action}%`);
  }
  if (filter.result) {
    where.push('result = ?');
    params.push(filter.result);
  }
  if (filter.ip) {
    where.push('ip = ?');
    params.push(filter.ip);
  }
  if (filter.from) {
    where.push('created_at >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    where.push('created_at <= ?');
    params.push(filter.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM audit_log ${whereSql}`).get(...params) as { c: number }
  ).c;
  const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
  const offset = Math.max(filter.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT * FROM audit_log ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as AuditRow[];
  return { rows, total };
}

export function getAudit(db: Db, id: number): AuditRow | undefined {
  return db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id) as AuditRow | undefined;
}
