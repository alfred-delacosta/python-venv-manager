/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db.js';
import { upsertApp } from './catalog.js';
import { createPreset } from './presets.js';
import { exportCatalog } from './export.js';
import { ensureAdminUser } from '../server/users.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('catalog export', () => {
  it('exports apps and presets without secrets', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-export-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 't.sqlite'));
    ensureAdminUser(db, 'admin', 'secret-password-value');
    const app = upsertApp(db, {
      slug: 'demo',
      name: 'Demo',
      kind: 'app',
      source_type: 'pypi',
      source_value: 'demo',
      venv_path: path.join(dir, '.venv'),
      entry_points: ['demo'],
    });
    createPreset(db, {
      app_id: app.id,
      name: 'help',
      entry_point: 'demo',
      args: ['--help'],
    });
    const payload = exportCatalog(db, { includePresets: true });
    const text = JSON.stringify(payload);
    expect(payload.apps).toHaveLength(1);
    expect(payload.presets).toHaveLength(1);
    expect(text).not.toContain('secret-password-value');
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('SESSION');
    db.close();
  });
});
