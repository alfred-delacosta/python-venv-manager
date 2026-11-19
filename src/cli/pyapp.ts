/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.js';
import { openDatabase, nowIso } from '../core/db.js';
import { getAppBySlug, insertRun, listApps } from '../core/catalog.js';
import { activateCommand, pythonPathCommand, type ShellKind } from '../core/activate.js';
import { parseRunArgs } from '../core/validators.js';
import { resolveEntryPoint, spawnAllowlisted } from '../core/spawn.js';
import { appendCappedLog } from '../core/redact.js';
import { MAX_LOG_BYTES } from '../core/config.js';
import { writeAudit } from '../core/audit.js';
import { venvPython } from '../core/paths.js';

function usage(): never {
  console.log(`Usage:
  pyapp list
  pyapp path <app>
  pyapp activate <project> [--shell powershell|cmd|bash|zsh]
  pyapp run <app> [entry] [-- args...]`);
  process.exit(1);
}

function openDb() {
  const config = loadConfig(process.env, { requireSessionSecret: false });
  if (!fs.existsSync(config.dbPath)) {
    console.error('Catalog database not found. Start the server once to create it.');
    process.exit(1);
  }
  return { db: openDatabase(config.dbPath), config };
}

function parseShell(value: string | undefined): ShellKind {
  if (!value || !['powershell', 'cmd', 'bash', 'zsh'].includes(value)) {
    console.error('Invalid --shell value');
    process.exit(1);
  }
  return value as ShellKind;
}

export function parseCliArgv(argv: string[]): {
  command: string;
  positional: string[];
  passthrough: string[];
  shell?: ShellKind;
} {
  const args = argv.slice(2);
  if (args.length === 0) usage();
  const command = args[0];
  const dashDash = args.indexOf('--');
  const before = dashDash === -1 ? args.slice(1) : args.slice(1, dashDash);
  const passthrough = dashDash === -1 ? [] : args.slice(dashDash + 1);
  let shell: ShellKind | undefined;
  const positional: string[] = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] === '--shell') {
      shell = parseShell(before[i + 1]);
      i += 1;
      continue;
    }
    positional.push(before[i]);
  }
  return { command, positional, passthrough, shell };
}

export function main(argv = process.argv): void {
  const parsed = parseCliArgv(argv);
  if (parsed.command === 'list') {
    const { db } = openDb();
    const apps = listApps(db);
    for (const app of apps) {
      console.log(`${app.kind}\t${app.slug}\t${app.version ?? '-'}\t${app.venv_path}`);
    }
    db.close();
    return;
  }

  if (parsed.command === 'path') {
    const slug = parsed.positional[0];
    if (!slug) usage();
    const { db } = openDb();
    const app = getAppBySlug(db, slug);
    db.close();
    if (!app) {
      console.error(`Unknown app: ${slug}`);
      process.exit(1);
    }
    console.log(venvPython(app.venv_path));
    return;
  }

  if (parsed.command === 'activate') {
    const slug = parsed.positional[0];
    if (!slug) usage();
    const { db } = openDb();
    const app = getAppBySlug(db, slug);
    db.close();
    if (!app) {
      console.error(`Unknown project/app: ${slug}`);
      process.exit(1);
    }
    const shell = parsed.shell ?? (process.platform === 'win32' ? 'powershell' : 'bash');
    console.log(activateCommand(app.venv_path, shell));
    console.log(pythonPathCommand(app.venv_path, shell));
    return;
  }

  if (parsed.command === 'run') {
    const slug = parsed.positional[0];
    if (!slug) usage();
    let entry = parsed.positional[1];
    const { db } = openDb();
    const app = getAppBySlug(db, slug);
    if (!app) {
      console.error(`Unknown app: ${slug}`);
      process.exit(1);
    }
    const entryPoints = JSON.parse(app.entry_points_json) as string[];
    if (!entry) {
      entry = entryPoints[0] ?? app.slug;
    }
    let userArgs: string[] = [];
    try {
      userArgs = parseRunArgs(parsed.passthrough);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }

    let command: string;
    let args: string[];
    try {
      const resolved = resolveEntryPoint(app.venv_path, entry);
      command = resolved.command;
      args = [...resolved.args, ...userArgs];
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }

    const started = Date.now();
    const startedAt = nowIso();
    let log = '';
    const child = spawnAllowlisted(
      {
        command,
        args,
        registeredVenvDir: app.venv_path,
        allowPython: true,
      },
      { stdio: ['inherit', 'pipe', 'pipe'] },
    );
    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
      log = appendCappedLog(log, chunk.toString('utf8'), MAX_LOG_BYTES);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
      log = appendCappedLog(log, chunk.toString('utf8'), MAX_LOG_BYTES);
    });
    child.on('close', (code) => {
      const endedAt = nowIso();
      const exitCode = code ?? 1;
      try {
        insertRun(db, {
          app_id: app.id,
          entry_point: entry,
          started_at: startedAt,
          ended_at: endedAt,
          exit_code: exitCode,
          duration_ms: Date.now() - started,
          log,
          source: 'cli',
        });
        writeAudit(db, {
          who: 'cli',
          action: 'run',
          result: exitCode === 0 ? 'ok' : 'failed',
          details: JSON.stringify({ slug, entry, exitCode }),
        });
      } catch {
        // best effort
      }
      db.close();
      process.exit(exitCode);
    });
    return;
  }

  usage();
}

const entry = process.argv[1] ? path.normalize(process.argv[1]) : '';
if (entry.endsWith(`${path.sep}pyapp.ts`) || entry.endsWith(`${path.sep}pyapp.js`) || entry.endsWith(`${path.sep}pyapp`)) {
  main();
}
