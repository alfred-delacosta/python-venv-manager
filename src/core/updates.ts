/* Copyright Advanced Software and AI Solutions LLC */
import type { Db } from './db.js';
import { nowIso } from './db.js';
import type { AppRow } from './catalog.js';
import { getAppBySlug, listApps } from './catalog.js';
import { packageNameFromRequirement } from './install.js';
import { runCapture } from './spawn.js';

export type UpdateCheckResult = {
  slug: string;
  checked: boolean;
  updateAvailable: boolean;
  remoteVersion: string | null;
  installedVersion: string | null;
  note?: string;
};

function compareVersions(installed: string | null, remote: string | null): boolean {
  if (!installed || !remote) return false;
  const a = installed.replace(/^v/i, '').split(/[.+-]/).map((p) => Number(p) || 0);
  const b = remote.replace(/^v/i, '').split(/[.+-]/).map((p) => Number(p) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (right > left) return true;
    if (right < left) return false;
  }
  return false;
}

function extractLatestVersion(stdout: string): string | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  // uv pip index versions typically prints versions; take the last non-empty token-looking line.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const match = line.match(/\b(\d+\.\d+(?:\.\d+)?(?:[a-zA-Z0-9._+-]*)?)\b/);
    if (match) return match[1];
  }
  return null;
}

export async function fetchRemoteVersion(
  app: AppRow,
  onLog?: (chunk: string) => void,
): Promise<{ remote: string | null; note?: string }> {
  if (app.source_type === 'pypi') {
    const name = packageNameFromRequirement(app.source_value);
    if (name.startsWith('-')) throw new Error('Invalid package name');
    const result = await runCapture('uv', ['pip', 'index', 'versions', name]);
    if (result.stdout && onLog) onLog(result.stdout);
    if (result.stderr && onLog) onLog(result.stderr);
    if (result.code !== 0) {
      return { remote: null, note: result.stderr || 'uv pip index versions failed' };
    }
    return { remote: extractLatestVersion(result.stdout) };
  }
  if (app.source_type === 'github') {
    return {
      remote: null,
      note: 'GitHub update checks use Update to reinstall the configured ref',
    };
  }
  return { remote: null, note: 'Update checks apply to PyPI apps' };
}

export function markUpdateResult(
  db: Db,
  appId: number,
  remoteVersion: string | null,
  updateAvailable: boolean,
): void {
  db.prepare(
    `UPDATE apps SET remote_version = ?, update_checked_at = ?, update_available = ?, updated_at = ?
     WHERE id = ?`,
  ).run(remoteVersion, nowIso(), updateAvailable ? 1 : 0, nowIso(), appId);
}

export async function checkAppUpdate(
  db: Db,
  slug: string,
  onLog?: (chunk: string) => void,
): Promise<UpdateCheckResult> {
  const app = getAppBySlug(db, slug);
  if (!app) throw new Error('App not found');
  if (app.source_type !== 'pypi') {
    markUpdateResult(db, app.id, null, false);
    return {
      slug,
      checked: false,
      updateAvailable: false,
      remoteVersion: null,
      installedVersion: app.version,
      note: 'Skipped non-PyPI source',
    };
  }
  const { remote, note } = await fetchRemoteVersion(app, onLog);
  const updateAvailable = compareVersions(app.version, remote);
  markUpdateResult(db, app.id, remote, updateAvailable);
  return {
    slug,
    checked: true,
    updateAvailable,
    remoteVersion: remote,
    installedVersion: app.version,
    note,
  };
}

export async function checkAllUpdates(
  db: Db,
  onLog?: (chunk: string) => void,
): Promise<UpdateCheckResult[]> {
  const apps = listApps(db, 'app').filter((a) => a.source_type === 'pypi');
  const out: UpdateCheckResult[] = [];
  for (const app of apps) {
    out.push(await checkAppUpdate(db, app.slug, onLog));
  }
  return out;
}

export { compareVersions, extractLatestVersion };
