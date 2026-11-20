/* Copyright Advanced Software and AI Solutions LLC */
import type { Db } from './db.js';
import { listApps } from './catalog.js';
import { listPresets } from './presets.js';
import { listSchedules } from './schedules.js';

export type CatalogExport = {
  exportedAt: string;
  version: 1;
  apps: Array<{
    slug: string;
    name: string;
    kind: string;
    source_type: string;
    source_value: string;
    venv_path: string;
    version: string | null;
    entry_points: string[];
    remote_version?: string | null;
    update_available?: boolean;
  }>;
  presets: Array<{
    app_slug: string;
    name: string;
    entry_point: string;
    args: string[];
  }>;
  schedules?: Array<{
    app_slug: string;
    entry_point: string;
    args: string[];
    interval_minutes: number;
    enabled: boolean;
    cwd: string | null;
  }>;
};

export function exportCatalog(
  db: Db,
  options: { includePresets?: boolean; includeSchedules?: boolean } = {},
): CatalogExport {
  const includePresets = options.includePresets !== false;
  const includeSchedules = Boolean(options.includeSchedules);
  const apps = listApps(db).map((app) => ({
    slug: app.slug,
    name: app.name,
    kind: app.kind,
    source_type: app.source_type,
    source_value: app.source_value,
    venv_path: app.venv_path,
    version: app.version,
    entry_points: JSON.parse(app.entry_points_json) as string[],
    remote_version: app.remote_version ?? null,
    update_available: Boolean(app.update_available),
  }));

  const presets: CatalogExport['presets'] = [];
  if (includePresets) {
    for (const app of listApps(db)) {
      for (const preset of listPresets(db, app.id)) {
        presets.push({
          app_slug: app.slug,
          name: preset.name,
          entry_point: preset.entry_point,
          args: JSON.parse(preset.args_json) as string[],
        });
      }
    }
  }

  const out: CatalogExport = {
    exportedAt: new Date().toISOString(),
    version: 1,
    apps,
    presets,
  };

  if (includeSchedules) {
    out.schedules = listSchedules(db).map((s) => ({
      app_slug: s.slug,
      entry_point: s.entry_point,
      args: JSON.parse(s.args_json) as string[],
      interval_minutes: s.interval_minutes,
      enabled: Boolean(s.enabled),
      cwd: s.cwd,
    }));
  }

  // Never include users, sessions, secrets, job logs, or run logs.
  return out;
}
