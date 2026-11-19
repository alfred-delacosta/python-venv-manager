/* Copyright Advanced Software and AI Solutions LLC */
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.js';
import { nowIso } from './db.js';
import { MAX_LOG_BYTES } from './config.js';
import { appendCappedLog } from './redact.js';
import { getAppBySlug, getAppById, insertRun, type RunRow } from './catalog.js';
import { parseRunArgs, parseSlug, ValidationError } from './validators.js';
import { killProcessTree, resolveEntryPoint, spawnAllowlisted } from './spawn.js';
import {
  appendStreamLine,
  appendStreamStatus,
  closeStream,
  streamKeyRun,
} from './stream-hub.js';
import { writeAudit } from './audit.js';
import { getPreset, presetArgs } from './presets.js';

type ActiveRun = {
  child: ChildProcessWithoutNullStreams;
  log: string;
  startedAtMs: number;
  appId: number;
};

const activeRuns = new Map<number, ActiveRun>();

export function getRun(db: Db, id: number): RunRow | undefined {
  return db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined;
}

export type RunFilter = {
  appId?: number;
  slug?: string;
  source?: 'cli' | 'web';
  result?: 'ok' | 'failed' | 'running';
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type RunListItem = RunRow & { slug: string; name: string };

export function listRuns(db: Db, filter: RunFilter = {}): { rows: RunListItem[]; total: number } {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filter.appId !== undefined) {
    where.push('r.app_id = ?');
    params.push(filter.appId);
  }
  if (filter.slug) {
    where.push('a.slug = ?');
    params.push(parseSlug(filter.slug));
  }
  if (filter.source) {
    where.push('r.source = ?');
    params.push(filter.source);
  }
  if (filter.result === 'ok') {
    where.push('r.ended_at IS NOT NULL AND r.exit_code = 0');
  } else if (filter.result === 'failed') {
    where.push('r.ended_at IS NOT NULL AND (r.exit_code IS NULL OR r.exit_code != 0)');
  } else if (filter.result === 'running') {
    where.push('r.ended_at IS NULL');
  }
  if (filter.from) {
    where.push('r.started_at >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    where.push('r.started_at <= ?');
    params.push(filter.to);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM runs r JOIN apps a ON a.id = r.app_id ${whereSql}`,
      )
      .get(...params) as { c: number }
  ).c;

  const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
  const offset = Math.max(filter.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT r.*, a.slug, a.name
       FROM runs r JOIN apps a ON a.id = r.app_id
       ${whereSql}
       ORDER BY r.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as RunListItem[];

  return { rows, total };
}

function updateRun(
  db: Db,
  id: number,
  patch: {
    ended_at?: string;
    exit_code?: number | null;
    duration_ms?: number | null;
    log?: string;
  },
): void {
  db.prepare(
    `UPDATE runs SET
      ended_at = COALESCE(?, ended_at),
      exit_code = COALESCE(?, exit_code),
      duration_ms = COALESCE(?, duration_ms),
      log = COALESCE(?, log)
     WHERE id = ?`,
  ).run(
    patch.ended_at ?? null,
    patch.exit_code ?? null,
    patch.duration_ms ?? null,
    patch.log ?? null,
    id,
  );
}

function appendRunLog(db: Db, runId: number, chunk: string): void {
  const active = activeRuns.get(runId);
  if (!active) return;
  active.log = appendCappedLog(active.log, chunk, MAX_LOG_BYTES);
  db.prepare('UPDATE runs SET log = ? WHERE id = ?').run(active.log, runId);
  appendStreamLine(streamKeyRun(runId), chunk);
}

export function startWebRun(
  db: Db,
  input: {
    slug: string;
    entryPoint?: string;
    args?: string[];
    presetId?: number;
    cwd?: string;
    who: string;
    ip?: string;
  },
): RunRow {
  const slug = parseSlug(input.slug);
  const app = getAppBySlug(db, slug);
  if (!app) throw new ValidationError('App not found');

  let entry = input.entryPoint;
  let args = input.args ?? [];
  if (input.presetId !== undefined) {
    const preset = getPreset(db, input.presetId);
    if (!preset || preset.app_id !== app.id) {
      throw new ValidationError('Preset not found for this app');
    }
    entry = preset.entry_point;
    args = presetArgs(preset);
  }
  const entryPoints = JSON.parse(app.entry_points_json) as string[];
  if (!entry) entry = entryPoints[0] ?? app.slug;
  if (entry.startsWith('-')) throw new ValidationError('Entry point must not start with a hyphen');
  args = parseRunArgs(args);

  let cwd: string | undefined;
  if (input.cwd !== undefined && input.cwd !== '') {
    if (!path.isAbsolute(input.cwd)) {
      throw new ValidationError('Working folder must be an absolute path');
    }
    if (input.cwd.startsWith('-')) {
      throw new ValidationError('Working folder must not start with a hyphen');
    }
    if (!fs.existsSync(input.cwd)) {
      throw new ValidationError('Working folder does not exist');
    }
    cwd = fs.realpathSync(input.cwd);
  }

  const resolved = resolveEntryPoint(app.venv_path, entry);
  const startedAt = nowIso();
  const runId = insertRun(db, {
    app_id: app.id,
    entry_point: entry,
    started_at: startedAt,
    log: '',
    source: 'web',
  });

  appendStreamStatus(streamKeyRun(runId), 'running');
  writeAudit(db, {
    who: input.who,
    action: 'run.start',
    result: 'ok',
    details: JSON.stringify({ runId, slug, entry }),
    ip: input.ip,
  });

  const child = spawnAllowlisted(
    {
      command: resolved.command,
      args: [...resolved.args, ...args],
      cwd,
      registeredVenvDir: app.venv_path,
      allowPython: resolved.allowPython,
    },
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  activeRuns.set(runId, {
    child,
    log: '',
    startedAtMs: Date.now(),
    appId: app.id,
  });

  child.stdout.on('data', (chunk: Buffer) => appendRunLog(db, runId, chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => appendRunLog(db, runId, chunk.toString('utf8')));
  child.on('error', (err) => {
    const active = activeRuns.get(runId);
    const message = err.message;
    if (active) {
      active.log = appendCappedLog(active.log, `\nERROR: ${message}\n`, MAX_LOG_BYTES);
    }
    finishRun(db, runId, 1, input.who, input.ip, 'failed');
  });
  child.on('close', (code) => {
    finishRun(db, runId, code ?? 1, input.who, input.ip, code === 0 ? 'ok' : 'failed');
  });

  return getRun(db, runId)!;
}

function finishRun(
  db: Db,
  runId: number,
  exitCode: number,
  who: string,
  ip: string | undefined,
  result: string,
): void {
  const active = activeRuns.get(runId);
  if (!active) {
    // already finished (cancel then close)
    const run = getRun(db, runId);
    if (run && !run.ended_at) {
      updateRun(db, runId, {
        ended_at: nowIso(),
        exit_code: exitCode,
        duration_ms: 0,
      });
      closeStream(streamKeyRun(runId), result);
    }
    return;
  }
  const duration = Date.now() - active.startedAtMs;
  updateRun(db, runId, {
    ended_at: nowIso(),
    exit_code: exitCode,
    duration_ms: duration,
    log: active.log,
  });
  activeRuns.delete(runId);
  appendStreamStatus(streamKeyRun(runId), result);
  closeStream(streamKeyRun(runId), JSON.stringify({ exitCode, durationMs: duration, result }));
  writeAudit(db, {
    who,
    action: 'run.finish',
    result,
    details: JSON.stringify({ runId, exitCode, durationMs: duration }),
    ip,
  });
}

export async function cancelWebRun(
  db: Db,
  runId: number,
  who: string,
  ip?: string,
): Promise<void> {
  const run = getRun(db, runId);
  if (!run) throw new ValidationError('Run not found');
  const active = activeRuns.get(runId);
  if (!active) throw new ValidationError('Run is not active');
  appendStreamStatus(streamKeyRun(runId), 'cancelling');
  if (active.child.pid) {
    await killProcessTree(active.child.pid);
  }
  writeAudit(db, {
    who,
    action: 'run.cancel',
    result: 'ok',
    details: JSON.stringify({ runId }),
    ip,
  });
}

export function isRunActive(runId: number): boolean {
  return activeRuns.has(runId);
}

/** Test helper */
export function resetActiveRunsForTests(): void {
  activeRuns.clear();
}

export function assertAppOwnsRun(db: Db, runId: number, slug: string): RunRow {
  const run = getRun(db, runId);
  if (!run) throw new ValidationError('Run not found');
  const app = getAppById(db, run.app_id);
  if (!app || app.slug !== parseSlug(slug)) throw new ValidationError('Run not found');
  return run;
}
