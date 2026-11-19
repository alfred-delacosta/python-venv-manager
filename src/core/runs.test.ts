/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from './db.js';
import { insertRun, upsertApp } from './catalog.js';
import { listRuns, resetActiveRunsForTests } from './runs.js';
import { resetStreamHubForTests } from './stream-hub.js';

vi.mock('./spawn.js', async () => {
  const actual = await vi.importActual<typeof import('./spawn.js')>('./spawn.js');
  return {
    ...actual,
    resolveEntryPoint: () => ({
      command: 'uv',
      args: [],
      registeredVenvDir: 'x',
      allowPython: false,
    }),
    spawnAllowlisted: () => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        pid: number;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.pid = 4242;
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from('<b>hi</b>\n'));
        child.emit('close', 0);
      }, 10);
      return child;
    },
    killProcessTree: vi.fn(async () => undefined),
  };
});

const dirs: string[] = [];
afterEach(() => {
  resetActiveRunsForTests();
  resetStreamHubForTests();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('run history filters', () => {
  it('filters by source and result', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-runs-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 't.sqlite'));
    const app = upsertApp(db, {
      slug: 'demo',
      name: 'Demo',
      kind: 'app',
      source_type: 'pypi',
      source_value: 'demo',
      venv_path: path.join(dir, '.venv'),
    });
    insertRun(db, {
      app_id: app.id,
      started_at: '2026-01-01T00:00:00.000Z',
      ended_at: '2026-01-01T00:00:01.000Z',
      exit_code: 0,
      source: 'cli',
      log: 'ok',
    });
    insertRun(db, {
      app_id: app.id,
      started_at: '2026-01-02T00:00:00.000Z',
      ended_at: '2026-01-02T00:00:01.000Z',
      exit_code: 1,
      source: 'web',
      log: 'fail',
    });
    expect(listRuns(db, { source: 'cli' }).total).toBe(1);
    expect(listRuns(db, { result: 'failed' }).total).toBe(1);
    expect(listRuns(db, { slug: 'demo' }).rows[0].slug).toBe('demo');
    db.close();
  });
});

describe('web run cancel path', () => {
  it('starts a mocked run and keeps HTML inert in stored log text', async () => {
    const { startWebRun, getRun } = await import('./runs.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-runm-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 't.sqlite'));
    upsertApp(db, {
      slug: 'demo',
      name: 'Demo',
      kind: 'app',
      source_type: 'pypi',
      source_value: 'demo',
      venv_path: path.join(dir, '.venv'),
      entry_points: ['demo'],
    });
    const run = startWebRun(db, { slug: 'demo', who: 'admin', args: [] });
    await new Promise((r) => setTimeout(r, 40));
    const finished = getRun(db, run.id)!;
    expect(finished.exit_code).toBe(0);
    expect(finished.log).toContain('<b>hi</b>');
    expect(finished.source).toBe('web');
    db.close();
  });
});
