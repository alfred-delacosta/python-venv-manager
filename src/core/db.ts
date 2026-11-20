/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export const SCHEMA_VERSION = 2;

export function openDatabase(dbPath: string): Db {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function getSchemaVersion(db: Db): number {
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  return row ? Number(row.value) || 0 : 0;
}

function setSchemaVersion(db: Db, version: number): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(version));
}

function tableHasColumn(db: Db, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function ensureBaseSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      ip TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('app', 'project')),
      source_type TEXT NOT NULL,
      source_value TEXT NOT NULL,
      python_path TEXT,
      venv_path TEXT NOT NULL,
      version TEXT,
      entry_points_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER,
      slug TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      log TEXT NOT NULL DEFAULT '',
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL,
      entry_point TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      exit_code INTEGER,
      duration_ms INTEGER,
      log TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL CHECK (source IN ('cli', 'web', 'schedule')),
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      who TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      entry_point TEXT NOT NULL,
      args_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(app_id, name),
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_runs_app_id ON runs(app_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_presets_app ON presets(app_id, name COLLATE NOCASE);
  `);
}

function migrateToV2(db: Db): void {
  if (!tableHasColumn(db, 'apps', 'remote_version')) {
    db.exec(`ALTER TABLE apps ADD COLUMN remote_version TEXT`);
  }
  if (!tableHasColumn(db, 'apps', 'update_checked_at')) {
    db.exec(`ALTER TABLE apps ADD COLUMN update_checked_at TEXT`);
  }
  if (!tableHasColumn(db, 'apps', 'update_available')) {
    db.exec(`ALTER TABLE apps ADD COLUMN update_available INTEGER NOT NULL DEFAULT 0`);
  }

  // Recreate runs table if schedule source is not accepted (older CHECK).
  const probe = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='runs'`).get() as
    | { sql: string }
    | undefined;
  if (probe?.sql && !probe.sql.includes("'schedule'")) {
    db.exec(`
      CREATE TABLE runs_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        entry_point TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        exit_code INTEGER,
        duration_ms INTEGER,
        log TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL CHECK (source IN ('cli', 'web', 'schedule')),
        FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
      );
      INSERT INTO runs_v2 (id, app_id, entry_point, started_at, ended_at, exit_code, duration_ms, log, source)
      SELECT id, app_id, entry_point, started_at, ended_at, exit_code, duration_ms, log, source FROM runs;
      DROP TABLE runs;
      ALTER TABLE runs_v2 RENAME TO runs;
      CREATE INDEX IF NOT EXISTS idx_runs_app_id ON runs(app_id, id DESC);
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL,
      preset_id INTEGER,
      entry_point TEXT NOT NULL,
      args_json TEXT NOT NULL DEFAULT '[]',
      interval_minutes INTEGER NOT NULL,
      next_run_at TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      cwd TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
      FOREIGN KEY (preset_id) REFERENCES presets(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_schedules_next ON schedules(enabled, next_run_at);
  `);
}

export function migrate(db: Db): void {
  ensureBaseSchema(db);
  let version = getSchemaVersion(db);
  if (version < 2) {
    migrateToV2(db);
    version = 2;
  }
  setSchemaVersion(db, Math.max(version, SCHEMA_VERSION));
}

export function nowIso(date = new Date()): string {
  return date.toISOString();
}
