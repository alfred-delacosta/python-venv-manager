/* Copyright Advanced Software and AI Solutions LLC */
import type { Db } from './db.js';
import { nowIso } from './db.js';
import { parseRunArgs, ValidationError } from './validators.js';

export type PresetRow = {
  id: number;
  app_id: number;
  name: string;
  entry_point: string;
  args_json: string;
  created_at: string;
  updated_at: string;
};

export function listPresets(db: Db, appId: number): PresetRow[] {
  return db
    .prepare('SELECT * FROM presets WHERE app_id = ? ORDER BY name COLLATE NOCASE')
    .all(appId) as PresetRow[];
}

export function getPreset(db: Db, id: number): PresetRow | undefined {
  return db.prepare('SELECT * FROM presets WHERE id = ?').get(id) as PresetRow | undefined;
}

export function createPreset(
  db: Db,
  input: { app_id: number; name: string; entry_point: string; args: string[] },
): PresetRow {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Preset name is required');
  if (name.startsWith('-')) throw new ValidationError('Preset name must not start with a hyphen');
  if (input.entry_point.startsWith('-')) {
    throw new ValidationError('Entry point must not start with a hyphen');
  }
  const args = parseRunArgs(input.args);
  const ts = nowIso();
  try {
    const result = db.prepare(
      `INSERT INTO presets (app_id, name, entry_point, args_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(input.app_id, name, input.entry_point, JSON.stringify(args), ts, ts);
    return getPreset(db, Number(result.lastInsertRowid))!;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE')) {
      throw new ValidationError('Preset name must be unique for this app');
    }
    throw err;
  }
}

export function renamePreset(db: Db, id: number, name: string): PresetRow {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError('Preset name is required');
  if (trimmed.startsWith('-')) throw new ValidationError('Preset name must not start with a hyphen');
  const existing = getPreset(db, id);
  if (!existing) throw new ValidationError('Preset not found');
  try {
    db.prepare('UPDATE presets SET name = ?, updated_at = ? WHERE id = ?').run(
      trimmed,
      nowIso(),
      id,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE')) {
      throw new ValidationError('Preset name must be unique for this app');
    }
    throw err;
  }
  return getPreset(db, id)!;
}

export function updatePresetArgs(
  db: Db,
  id: number,
  input: { entry_point?: string; args?: string[] },
): PresetRow {
  const existing = getPreset(db, id);
  if (!existing) throw new ValidationError('Preset not found');
  const entry = input.entry_point ?? existing.entry_point;
  if (entry.startsWith('-')) throw new ValidationError('Entry point must not start with a hyphen');
  const args =
    input.args !== undefined ? parseRunArgs(input.args) : (JSON.parse(existing.args_json) as string[]);
  db.prepare(
    'UPDATE presets SET entry_point = ?, args_json = ?, updated_at = ? WHERE id = ?',
  ).run(entry, JSON.stringify(args), nowIso(), id);
  return getPreset(db, id)!;
}

export function deletePreset(db: Db, id: number): void {
  db.prepare('DELETE FROM presets WHERE id = ?').run(id);
}

export function presetArgs(preset: PresetRow): string[] {
  return parseRunArgs(JSON.parse(preset.args_json) as string[]);
}
