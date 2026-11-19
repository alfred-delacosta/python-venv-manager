/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db.js';
import { writeAudit } from './audit.js';
import { getAudit, listAudit } from './audit-query.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('audit query', () => {
  it('lists with filters and remains read only via query helpers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-audit-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 't.sqlite'));
    writeAudit(db, { who: 'admin', action: 'login', result: 'ok', ip: '127.0.0.1' });
    writeAudit(db, { who: 'admin', action: 'run.start', result: 'ok', ip: '10.0.0.2' });
    expect(listAudit(db, { action: 'login' }).total).toBe(1);
    expect(listAudit(db, { ip: '10.0.0.2' }).total).toBe(1);
    const row = listAudit(db).rows[0];
    expect(getAudit(db, row.id)?.action).toBeTruthy();
    db.close();
  });
});
