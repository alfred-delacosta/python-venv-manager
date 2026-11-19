/* Copyright Advanced Software and AI Solutions LLC */
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.js';
import { nowIso } from './db.js';
import { MAX_LOG_BYTES } from './config.js';
import { appendCappedLog } from './redact.js';
import { killProcessTree, spawnAllowlisted } from './spawn.js';
import {
  deleteApp,
  getAppBySlug,
  setSetting,
  upsertApp,
  type AppKind,
} from './catalog.js';
import { installApp, installProject, repairApp } from './install.js';
import { assertSafeDeleteTarget, appDir } from './paths.js';
import {
  installSourceSchema,
  normalizeInstallSource,
  parseSlug,
  type InstallSource,
} from './validators.js';
import { writeAudit } from './audit.js';
import { appendStreamLine, appendStreamStatus, closeStream, streamKeyJob } from './stream-hub.js';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type JobRow = {
  id: number;
  app_id: number | null;
  slug: string | null;
  type: string;
  status: JobStatus;
  payload_json: string;
  log: string;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type JobPayload = {
  type: string;
  slug?: string;
  name?: string;
  kind?: AppKind;
  source?: InstallSource;
  python?: string;
  folder?: string;
  editable?: boolean;
  home: string;
  who: string;
  ip?: string;
};

const appLocks = new Set<string>();
const runningChildren = new Map<number, ChildProcessWithoutNullStreams>();

export function getJob(db: Db, id: number): JobRow | undefined {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
}

export function listJobs(db: Db, limit = 50): JobRow[] {
  return db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT ?').all(limit) as JobRow[];
}

export function enqueueJob(db: Db, payload: JobPayload): JobRow {
  const slug = payload.slug ? parseSlug(payload.slug) : null;
  if (slug) {
    const active = db
      .prepare(
        `SELECT id FROM jobs WHERE slug = ? AND status IN ('queued', 'running') LIMIT 1`,
      )
      .get(slug) as { id: number } | undefined;
    if (active) {
      throw new Error(`A job is already active for ${slug}`);
    }
  }
  const stored: JobPayload = { ...payload, slug: slug ?? undefined };
  const result = db.prepare(
    `INSERT INTO jobs (app_id, slug, type, status, payload_json, log, created_at)
     VALUES (?, ?, ?, 'queued', ?, '', ?)`,
  ).run(
    slug ? (getAppBySlug(db, slug)?.id ?? null) : null,
    slug,
    payload.type,
    JSON.stringify(stored),
    nowIso(),
  );
  const id = Number(result.lastInsertRowid);
  writeAudit(db, {
    who: payload.who,
    action: `job.enqueue.${payload.type}`,
    result: 'ok',
    details: JSON.stringify({ id, slug }),
    ip: payload.ip,
  });
  return getJob(db, id)!;
}

function appendJobLog(db: Db, jobId: number, chunk: string): void {
  const job = getJob(db, jobId);
  if (!job) return;
  const log = appendCappedLog(job.log, chunk, MAX_LOG_BYTES);
  db.prepare('UPDATE jobs SET log = ? WHERE id = ?').run(log, jobId);
  appendStreamLine(streamKeyJob(jobId), chunk);
}

function setJobStatus(
  db: Db,
  jobId: number,
  status: JobStatus,
  error?: string,
): void {
  const ts = nowIso();
  if (status === 'running') {
    db.prepare(
      `UPDATE jobs SET status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?`,
    ).run(status, ts, jobId);
    appendStreamStatus(streamKeyJob(jobId), status);
    return;
  }
  if (status === 'succeeded' || status === 'failed' || status === 'cancelled') {
    db.prepare(
      `UPDATE jobs SET status = ?, error = COALESCE(?, error), finished_at = ? WHERE id = ?`,
    ).run(status, error ?? null, ts, jobId);
    appendStreamStatus(streamKeyJob(jobId), status);
    closeStream(streamKeyJob(jobId), status);
    return;
  }
  db.prepare(`UPDATE jobs SET status = ? WHERE id = ?`).run(status, jobId);
  appendStreamStatus(streamKeyJob(jobId), status);
}

async function executeJob(db: Db, jobId: number): Promise<void> {
  const job = getJob(db, jobId);
  if (!job) return;
  let payload: JobPayload;
  try {
    payload = JSON.parse(job.payload_json) as JobPayload;
  } catch {
    setJobStatus(db, jobId, 'failed', 'Invalid job payload');
    return;
  }
  if (job.slug && appLocks.has(job.slug)) {
    return;
  }
  if (job.slug) appLocks.add(job.slug);
  setJobStatus(db, jobId, 'running');
  const onLog = (chunk: string) => appendJobLog(db, jobId, chunk);

  try {
    if (payload.type === 'install-app') {
      if (!payload.slug || !payload.name || !payload.source) {
        throw new Error('Missing install-app fields');
      }
      const result = await installApp({
        home: payload.home,
        slug: payload.slug,
        name: payload.name,
        source: payload.source,
        python: payload.python,
        onLog,
      });
      upsertApp(db, {
        slug: result.slug,
        name: payload.name,
        kind: 'app',
        source_type: result.source_type,
        source_value: result.source_value,
        venv_path: result.venv_path,
        version: result.version,
        entry_points: result.entry_points,
      });
    } else if (payload.type === 'install-project') {
      if (!payload.folder || !payload.slug || !payload.name) {
        throw new Error('Missing install-project fields');
      }
      const result = await installProject({
        folder: payload.folder,
        editable: payload.editable,
        python: payload.python,
        onLog,
      });
      upsertApp(db, {
        slug: payload.slug,
        name: payload.name,
        kind: 'project',
        source_type: 'local',
        source_value: path.resolve(payload.folder),
        venv_path: result.venv_path,
        version: result.version,
        entry_points: result.entry_points,
      });
    } else if (payload.type === 'update') {
      const app = getAppBySlug(db, payload.slug!);
      if (!app) throw new Error('App not found');
      const source = installSourceSchema.parse(
        app.source_type === 'pypi'
          ? { type: 'pypi', requirement: app.source_value }
          : app.source_type === 'github'
            ? { type: 'github', url: app.source_value }
            : { type: 'local', folder: app.source_value },
      );
      if (app.kind === 'project') {
        const result = await installProject({
          folder: app.source_value,
          python: payload.python,
          onLog,
        });
        upsertApp(db, {
          slug: app.slug,
          name: app.name,
          kind: 'project',
          source_type: app.source_type,
          source_value: app.source_value,
          venv_path: result.venv_path,
          version: result.version,
          entry_points: result.entry_points,
        });
      } else {
        const result = await repairApp({
          home: payload.home,
          slug: app.slug,
          name: app.name,
          source,
          python: payload.python,
          onLog,
        });
        upsertApp(db, {
          slug: result.slug,
          name: app.name,
          kind: 'app',
          source_type: result.source_type,
          source_value: result.source_value,
          venv_path: result.venv_path,
          version: result.version,
          entry_points: result.entry_points,
        });
      }
    } else if (payload.type === 'repair') {
      const app = getAppBySlug(db, payload.slug!);
      if (!app) throw new Error('App not found');
      const source = installSourceSchema.parse(
        app.source_type === 'pypi'
          ? { type: 'pypi', requirement: app.source_value }
          : app.source_type === 'github'
            ? { type: 'github', url: app.source_value }
            : { type: 'local', folder: app.source_value, editable: true },
      );
      const result = await repairApp({
        home: payload.home,
        slug: app.slug,
        name: app.name,
        source,
        python: payload.python,
        onLog,
      });
      upsertApp(db, {
        slug: result.slug,
        name: app.name,
        kind: app.kind,
        source_type: result.source_type,
        source_value: result.source_value,
        venv_path: result.venv_path,
        version: result.version,
        entry_points: result.entry_points,
      });
    } else if (payload.type === 'remove') {
      const app = getAppBySlug(db, payload.slug!);
      if (!app) throw new Error('App not found');
      if (app.kind === 'app') {
        const dir = appDir(payload.home, app.slug);
        if (fs.existsSync(dir)) {
          const safe = assertSafeDeleteTarget(dir, payload.home);
          fs.rmSync(safe, { recursive: true, force: true });
        }
      }
      deleteApp(db, app.slug);
    } else if (payload.type === 'register') {
      if (!payload.folder || !payload.slug || !payload.name || !payload.kind) {
        throw new Error('Missing register fields');
      }
      const folder = path.resolve(payload.folder);
      const venvPath =
        payload.kind === 'project'
          ? path.join(folder, '.venv')
          : path.join(folder, '.venv');
      const cfg = path.join(venvPath, 'pyvenv.cfg');
      if (!fs.existsSync(cfg)) {
        throw new Error('Existing venv needs pyvenv.cfg');
      }
      upsertApp(db, {
        slug: payload.slug,
        name: payload.name,
        kind: payload.kind,
        source_type: 'registered',
        source_value: folder,
        venv_path: venvPath,
        entry_points: [],
      });
    } else if (payload.type === 'uv-python-install') {
      if (!payload.python) throw new Error('Python version required');
      if (payload.python.startsWith('-')) {
        throw new Error('Python selector must not start with a hyphen');
      }
      await new Promise<void>((resolve, reject) => {
        const child = spawnAllowlisted({
          command: 'uv',
          args: ['python', 'install', payload.python!],
        });
        runningChildren.set(jobId, child);
        child.stdout.on('data', (c: Buffer) => onLog(c.toString('utf8')));
        child.stderr.on('data', (c: Buffer) => onLog(c.toString('utf8')));
        child.on('error', reject);
        child.on('close', (code) => {
          runningChildren.delete(jobId);
          if (code === 0) resolve();
          else reject(new Error(`uv python install exited with ${code}`));
        });
      });
    } else if (payload.type === 'settings-home') {
      if (!payload.folder) throw new Error('Home folder required');
      setSetting(db, 'pyapps_home', path.resolve(payload.folder));
    } else {
      throw new Error(`Unknown job type: ${payload.type}`);
    }

    const current = getJob(db, jobId);
    if (current?.status === 'cancelled') return;
    setJobStatus(db, jobId, 'succeeded');
    writeAudit(db, {
      who: payload.who,
      action: `job.${payload.type}`,
      result: 'succeeded',
      details: JSON.stringify({ id: jobId, slug: payload.slug }),
      ip: payload.ip,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendJobLog(db, jobId, `\nERROR: ${message}\n`);
    const current = getJob(db, jobId);
    if (current?.status !== 'cancelled') {
      setJobStatus(db, jobId, 'failed', message);
    }
    writeAudit(db, {
      who: payload.who,
      action: `job.${payload.type}`,
      result: 'failed',
      details: JSON.stringify({ id: jobId, error: message }),
      ip: payload.ip,
    });
  } finally {
    if (job.slug) appLocks.delete(job.slug);
    runningChildren.delete(jobId);
  }
}

export function startJobRunner(db: Db, concurrency: number): () => void {
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    const running = db
      .prepare(`SELECT COUNT(*) AS c FROM jobs WHERE status = 'running'`)
      .get() as { c: number };
    const slots = concurrency - Number(running.c);
    if (slots <= 0) return;
    const queued = db
      .prepare(
        `SELECT id FROM jobs WHERE status = 'queued' ORDER BY id ASC LIMIT ?`,
      )
      .all(slots) as { id: number }[];
    for (const row of queued) {
      void executeJob(db, row.id);
    }
  }, 250);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export async function cancelJob(db: Db, jobId: number, who: string, ip?: string): Promise<void> {
  const job = getJob(db, jobId);
  if (!job) throw new Error('Job not found');
  if (job.status !== 'queued' && job.status !== 'running') {
    throw new Error('Job is not cancellable');
  }
  setJobStatus(db, jobId, 'cancelled', 'Cancelled');
  const child = runningChildren.get(jobId);
  if (child?.pid) {
    await killProcessTree(child.pid);
  }
  writeAudit(db, {
    who,
    action: 'job.cancel',
    result: 'ok',
    details: JSON.stringify({ id: jobId }),
    ip,
  });
}

export function parseInstallSourceBody(body: unknown): InstallSource {
  return installSourceSchema.parse(body);
}

export function previewNormalizedSource(source: InstallSource) {
  return normalizeInstallSource(source);
}
