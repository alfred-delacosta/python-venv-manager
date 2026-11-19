/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from './db.js';
import { enqueueJob, getJob } from './jobs.js';

vi.mock('./spawn.js', async () => {
  const actual = await vi.importActual<typeof import('./spawn.js')>('./spawn.js');
  return {
    ...actual,
    runCapture: vi.fn(async (command: string, args: string[]) => {
      if (command === 'uv' && args[0] === 'venv') {
        const venvDir = args[1];
        fs.mkdirSync(venvDir, { recursive: true });
        const scripts = process.platform === 'win32' ? 'Scripts' : 'bin';
        fs.mkdirSync(path.join(venvDir, scripts), { recursive: true });
        fs.writeFileSync(path.join(venvDir, 'pyvenv.cfg'), 'home = mock\n');
        return { code: 0, stdout: 'venv ok\n', stderr: '' };
      }
      if (command === 'uv' && args[0] === 'pip') {
        return { code: 0, stdout: 'install ok\n', stderr: '' };
      }
      return { code: 0, stdout: '{"version":"1.0.0","entry_points":["crwl"]}\n', stderr: '' };
    }),
    spawnAllowlisted: vi.fn(() => {
      throw new Error('spawn should be mocked in unit tests');
    }),
    killProcessTree: vi.fn(async () => undefined),
  };
});

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

describe('job queue', () => {
  it('enqueues jobs with redacted payload storage and per-app lock semantics', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-db-'));
    tempDirs.push(dir);
    const db = openDatabase(path.join(dir, 'test.sqlite'));
    const job = enqueueJob(db, {
      type: 'install-app',
      slug: 'crwl',
      name: 'crwl',
      source: { type: 'pypi', requirement: 'crwl' },
      home: dir,
      who: 'admin',
      ip: '127.0.0.1',
    });
    expect(job.status).toBe('queued');
    expect(getJob(db, job.id)?.payload_json).toContain('crwl');
    expect(() =>
      enqueueJob(db, {
        type: 'install-app',
        slug: 'crwl',
        name: 'crwl',
        source: { type: 'pypi', requirement: 'crwl' },
        home: dir,
        who: 'admin',
      }),
    ).toThrow(/already active/);
    db.close();
  });
});
