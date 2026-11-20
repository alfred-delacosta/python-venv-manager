/* Copyright Advanced Software and AI Solutions LLC */
import type { Db } from './db.js';
import { nowIso } from './db.js';
import { MAX_RUNS_PER_APP } from './config.js';

export type AppKind = 'app' | 'project';

export type AppRow = {
  id: number;
  slug: string;
  name: string;
  kind: AppKind;
  source_type: string;
  source_value: string;
  python_path: string | null;
  venv_path: string;
  version: string | null;
  entry_points_json: string;
  remote_version?: string | null;
  update_checked_at?: string | null;
  update_available?: number;
  created_at: string;
  updated_at: string;
};

export type RunRow = {
  id: number;
  app_id: number;
  entry_point: string | null;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  log: string;
  source: 'cli' | 'web' | 'schedule';
};

export function listApps(db: Db, kind?: AppKind): AppRow[] {
  if (kind) {
    return db.prepare('SELECT * FROM apps WHERE kind = ? ORDER BY name COLLATE NOCASE').all(kind) as AppRow[];
  }
  return db.prepare('SELECT * FROM apps ORDER BY kind, name COLLATE NOCASE').all() as AppRow[];
}

export function getAppBySlug(db: Db, slug: string): AppRow | undefined {
  return db.prepare('SELECT * FROM apps WHERE slug = ?').get(slug) as AppRow | undefined;
}

export function getAppById(db: Db, id: number): AppRow | undefined {
  return db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as AppRow | undefined;
}

export function upsertApp(
  db: Db,
  app: {
    slug: string;
    name: string;
    kind: AppKind;
    source_type: string;
    source_value: string;
    python_path?: string | null;
    venv_path: string;
    version?: string | null;
    entry_points?: string[];
  },
): AppRow {
  const existing = getAppBySlug(db, app.slug);
  const ts = nowIso();
  const entryPoints = JSON.stringify(app.entry_points ?? []);
  if (existing) {
    db.prepare(
      `UPDATE apps SET name = ?, kind = ?, source_type = ?, source_value = ?,
       python_path = ?, venv_path = ?, version = ?, entry_points_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      app.name,
      app.kind,
      app.source_type,
      app.source_value,
      app.python_path ?? null,
      app.venv_path,
      app.version ?? null,
      entryPoints,
      ts,
      existing.id,
    );
    return getAppById(db, existing.id)!;
  }
  const result = db.prepare(
    `INSERT INTO apps (slug, name, kind, source_type, source_value, python_path, venv_path, version, entry_points_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    app.slug,
    app.name,
    app.kind,
    app.source_type,
    app.source_value,
    app.python_path ?? null,
    app.venv_path,
    app.version ?? null,
    entryPoints,
    ts,
    ts,
  );
  return getAppById(db, Number(result.lastInsertRowid))!;
}

export function deleteApp(db: Db, slug: string): void {
  db.prepare('DELETE FROM apps WHERE slug = ?').run(slug);
}

export function listRecentRuns(db: Db, appId: number, limit = 20): RunRow[] {
  return db
    .prepare('SELECT * FROM runs WHERE app_id = ? ORDER BY id DESC LIMIT ?')
    .all(appId, limit) as RunRow[];
}

export function insertRun(
  db: Db,
  run: {
    app_id: number;
    entry_point?: string;
    started_at: string;
    ended_at?: string;
    exit_code?: number | null;
    duration_ms?: number | null;
    log?: string;
    source: 'cli' | 'web' | 'schedule';
  },
): number {
  const result = db.prepare(
    `INSERT INTO runs (app_id, entry_point, started_at, ended_at, exit_code, duration_ms, log, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.app_id,
    run.entry_point ?? null,
    run.started_at,
    run.ended_at ?? null,
    run.exit_code ?? null,
    run.duration_ms ?? null,
    run.log ?? '',
    run.source,
  );
  trimRuns(db, run.app_id);
  return Number(result.lastInsertRowid);
}

export function trimRuns(db: Db, appId: number): void {
  db.prepare(
    `DELETE FROM runs WHERE app_id = ? AND id NOT IN (
      SELECT id FROM runs WHERE app_id = ? ORDER BY id DESC LIMIT ?
    )`,
  ).run(appId, appId, MAX_RUNS_PER_APP);
}

export function getSetting(db: Db, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
