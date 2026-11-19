/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db.js';
import { upsertApp } from './catalog.js';
import { createPreset, deletePreset, listPresets, renamePreset } from './presets.js';
import { ValidationError } from './validators.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('presets', () => {
  it('validates args and enforces unique names per app', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-preset-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 't.sqlite'));
    const app = upsertApp(db, {
      slug: 'crwl',
      name: 'crwl',
      kind: 'app',
      source_type: 'pypi',
      source_value: 'crwl',
      venv_path: path.join(dir, '.venv'),
      entry_points: ['crwl'],
    });
    createPreset(db, {
      app_id: app.id,
      name: 'help',
      entry_point: 'crwl',
      args: ['--help'],
    });
    expect(() =>
      createPreset(db, {
        app_id: app.id,
        name: 'help',
        entry_point: 'crwl',
        args: [],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      createPreset(db, {
        app_id: app.id,
        name: 'bad',
        entry_point: 'crwl',
        args: ['ok\0no'],
      }),
    ).toThrow(ValidationError);
    const renamed = renamePreset(db, listPresets(db, app.id)[0].id, 'help2');
    expect(renamed.name).toBe('help2');
    deletePreset(db, renamed.id);
    expect(listPresets(db, app.id)).toHaveLength(0);
    db.close();
  });
});
