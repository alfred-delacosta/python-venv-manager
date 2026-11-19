/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.js';
import { openDatabase } from '../core/db.js';

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function main(): void {
  const config = loadConfig();
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = openDatabase(config.dbPath);
  const dest = path.join(config.dataDir, `pyapps-backup-${timestamp()}.sqlite`);
  db.exec(`VACUUM INTO '${dest.replaceAll("'", "''")}'`);
  db.close();
  console.log(`Backup written to ${dest}`);
}

main();
