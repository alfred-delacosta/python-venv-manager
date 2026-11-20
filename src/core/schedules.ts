/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.js';
import { nowIso } from './db.js';
import { getAppById } from './catalog.js';
import { getPreset, presetArgs } from './presets.js';
import { parseRunArgs, ValidationError } from './validators.js';
import { isRunActive, startWebRun } from './runs.js';

export type ScheduleRow = {
  id: number;
  app_id: number;
  preset_id: number | null;
  entry_point: string;
  args_json: string;
  interval_minutes: number;
  next_run_at: string;
  enabled: number;
  cwd: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleListItem = ScheduleRow & { slug: string; name: string };

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 60 * 24 * 30;

export function listSchedules(db: Db): ScheduleListItem[] {
  return db
    .prepare(
      `SELECT s.*, a.slug, a.name
       FROM schedules s JOIN apps a ON a.id = s.app_id
       ORDER BY s.next_run_at ASC`,
    )
    .all() as ScheduleListItem[];
}

export function getSchedule(db: Db, id: number): ScheduleRow | undefined {
  return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as ScheduleRow | undefined;
}

export function createSchedule(
  db: Db,
  input: {
    app_id: number;
    preset_id?: number;
    entry_point?: string;
    args?: string[];
    interval_minutes: number;
    cwd?: string;
    enabled?: boolean;
  },
): ScheduleRow {
  if (
    !Number.isInteger(input.interval_minutes) ||
    input.interval_minutes < MIN_INTERVAL ||
    input.interval_minutes > MAX_INTERVAL
  ) {
    throw new ValidationError(
      `interval_minutes must be between ${MIN_INTERVAL} and ${MAX_INTERVAL}`,
    );
  }
  const app = getAppById(db, input.app_id);
  if (!app) throw new ValidationError('App not found');

  let entry = input.entry_point ?? '';
  let args = input.args ?? [];
  let presetId: number | null = null;
  if (input.preset_id !== undefined) {
    const preset = getPreset(db, input.preset_id);
    if (!preset || preset.app_id !== app.id) {
      throw new ValidationError('Preset not found for this app');
    }
    presetId = preset.id;
    entry = preset.entry_point;
    args = presetArgs(preset);
  }
  if (!entry || entry.startsWith('-')) {
    throw new ValidationError('Entry point is required and must not start with a hyphen');
  }
  args = parseRunArgs(args);

  let cwd: string | null = null;
  if (input.cwd) {
    if (!path.isAbsolute(input.cwd)) throw new ValidationError('cwd must be absolute');
    if (input.cwd.startsWith('-')) throw new ValidationError('cwd must not start with a hyphen');
    if (!fs.existsSync(input.cwd)) throw new ValidationError('cwd does not exist');
    cwd = fs.realpathSync(input.cwd);
  }

  const ts = nowIso();
  const next = new Date(Date.now() + input.interval_minutes * 60_000).toISOString();
  const result = db.prepare(
    `INSERT INTO schedules
      (app_id, preset_id, entry_point, args_json, interval_minutes, next_run_at, enabled, cwd, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    app.id,
    presetId,
    entry,
    JSON.stringify(args),
    input.interval_minutes,
    next,
    input.enabled === false ? 0 : 1,
    cwd,
    ts,
    ts,
  );
  return getSchedule(db, Number(result.lastInsertRowid))!;
}

export function updateSchedule(
  db: Db,
  id: number,
  patch: {
    enabled?: boolean;
    interval_minutes?: number;
    cwd?: string | null;
  },
): ScheduleRow {
  const existing = getSchedule(db, id);
  if (!existing) throw new ValidationError('Schedule not found');
  let interval = existing.interval_minutes;
  if (patch.interval_minutes !== undefined) {
    if (
      !Number.isInteger(patch.interval_minutes) ||
      patch.interval_minutes < MIN_INTERVAL ||
      patch.interval_minutes > MAX_INTERVAL
    ) {
      throw new ValidationError(
        `interval_minutes must be between ${MIN_INTERVAL} and ${MAX_INTERVAL}`,
      );
    }
    interval = patch.interval_minutes;
  }
  let cwd = existing.cwd;
  if (patch.cwd !== undefined) {
    if (patch.cwd === null || patch.cwd === '') cwd = null;
    else {
      if (!path.isAbsolute(patch.cwd)) throw new ValidationError('cwd must be absolute');
      if (patch.cwd.startsWith('-')) throw new ValidationError('cwd must not start with a hyphen');
      if (!fs.existsSync(patch.cwd)) throw new ValidationError('cwd does not exist');
      cwd = fs.realpathSync(patch.cwd);
    }
  }
  const enabled = patch.enabled === undefined ? existing.enabled : patch.enabled ? 1 : 0;
  const next =
    patch.interval_minutes !== undefined
      ? new Date(Date.now() + interval * 60_000).toISOString()
      : existing.next_run_at;
  db.prepare(
    `UPDATE schedules SET interval_minutes = ?, enabled = ?, cwd = ?, next_run_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(interval, enabled, cwd, next, nowIso(), id);
  return getSchedule(db, id)!;
}

export function deleteSchedule(db: Db, id: number): void {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
}

function appBusy(db: Db, appId: number, slug: string): boolean {
  const activeJob = db
    .prepare(
      `SELECT id FROM jobs WHERE slug = ? AND status IN ('queued', 'running') LIMIT 1`,
    )
    .get(slug) as { id: number } | undefined;
  if (activeJob) return true;
  const running = db
    .prepare(`SELECT id FROM runs WHERE app_id = ? AND ended_at IS NULL LIMIT 1`)
    .get(appId) as { id: number } | undefined;
  if (running && isRunActive(running.id)) return true;
  return false;
}

export function dueSchedules(db: Db, now = new Date()): ScheduleRow[] {
  return db
    .prepare(
      `SELECT * FROM schedules WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC`,
    )
    .all(now.toISOString()) as ScheduleRow[];
}

export function tickSchedules(db: Db): number {
  let started = 0;
  for (const schedule of dueSchedules(db)) {
    const app = getAppById(db, schedule.app_id);
    if (!app) continue;
    const next = new Date(Date.now() + schedule.interval_minutes * 60_000).toISOString();
    db.prepare('UPDATE schedules SET next_run_at = ?, updated_at = ? WHERE id = ?').run(
      next,
      nowIso(),
      schedule.id,
    );
    if (appBusy(db, app.id, app.slug)) continue;
    try {
      startWebRun(db, {
        slug: app.slug,
        entryPoint: schedule.entry_point,
        args: parseRunArgs(JSON.parse(schedule.args_json) as string[]),
        presetId: schedule.preset_id ?? undefined,
        cwd: schedule.cwd ?? undefined,
        who: 'scheduler',
        source: 'schedule',
      });
      started += 1;
    } catch {
      // leave next_run_at advanced to avoid hot-loop failures
    }
  }
  return started;
}

export function startScheduleTicker(db: Db, intervalMs = 30_000): () => void {
  const timer = setInterval(() => {
    try {
      tickSchedules(db);
    } catch {
      // keep ticker alive
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
