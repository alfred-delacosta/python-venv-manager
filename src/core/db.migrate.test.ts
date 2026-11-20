/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, SCHEMA_VERSION } from './db.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('schema migration', () => {
  it('sets schema version and creates phase 2 tables/columns', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-mig-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 't.sqlite'));
    const version = db.prepare(`SELECT value FROM meta WHERE key='schema_version'`).get() as {
      value: string;
    };
    expect(Number(version.value)).toBe(SCHEMA_VERSION);
    const cols = db.prepare(`PRAGMA table_info(apps)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'update_available')).toBe(true);
    const schedules = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schedules'`)
      .get();
    expect(schedules).toBeTruthy();
    db.close();
  });
});
