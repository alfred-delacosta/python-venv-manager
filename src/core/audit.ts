/* Copyright Advanced Software and AI Solutions LLC */
import type { Db } from './db.js';
import { nowIso } from './db.js';
import { redactSecrets } from './redact.js';

export function writeAudit(
  db: Db,
  entry: {
    who: string;
    action: string;
    result: string;
    details?: string;
    ip?: string;
  },
): void {
  db.prepare(
    `INSERT INTO audit_log (who, action, result, details, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.who,
    entry.action,
    entry.result,
    entry.details ? redactSecrets(entry.details) : null,
    entry.ip ?? null,
    nowIso(),
  );
}
