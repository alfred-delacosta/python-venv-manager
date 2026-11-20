/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from './db.js';
import { upsertApp } from './catalog.js';
import { createSchedule, dueSchedules, tickSchedules } from './schedules.js';
import { resetActiveRunsForTests } from './runs.js';

vi.mock('./runs.js', async () => {
  const actual = await vi.importActual<typeof import('./runs.js')>('./runs.js');
  return {
    ...actual,
    startWebRun: vi.fn(() => ({ id: 1 })),
    isRunActive: vi.fn(() => false),
  };
});

const dirs: string[] = [];
afterEach(() => {
  resetActiveRunsForTests();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('schedules', () => {
  it('creates schedules and ticks due ones', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-sched-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 't.sqlite'));
    const app = upsertApp(db, {
      slug: 'demo',
      name: 'Demo',
      kind: 'app',
      source_type: 'pypi',
      source_value: 'demo',
      venv_path: path.join(dir, '.venv'),
      entry_points: ['demo'],
    });
    const schedule = createSchedule(db, {
      app_id: app.id,
      entry_point: 'demo',
      args: [],
      interval_minutes: 5,
    });
    db.prepare('UPDATE schedules SET next_run_at = ? WHERE id = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      schedule.id,
    );
    expect(dueSchedules(db).length).toBe(1);
    const { startWebRun } = await import('./runs.js');
    expect(tickSchedules(db)).toBe(1);
    expect(startWebRun).toHaveBeenCalled();
    db.close();
  });
});
