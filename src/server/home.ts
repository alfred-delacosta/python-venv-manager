/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import type { Db } from '../core/db.js';
import type { AppConfig } from '../core/config.js';
import { getSetting } from '../core/catalog.js';

export function resolveHome(db: Db, config: AppConfig): string {
  const override = getSetting(db, 'pyapps_home');
  const home = override?.trim() ? override.trim() : config.pyappsHome;
  fs.mkdirSync(home, { recursive: true });
  return home;
}
