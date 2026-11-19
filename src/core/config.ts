/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = '127.0.0.1';
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const JOB_RATE_PER_MINUTE = 10;
export const DEFAULT_JOB_CONCURRENCY = 2;
export const MAX_LOG_BYTES = 1 * 1024 * 1024;
export const MAX_RUNS_PER_APP = 50;
export const MAX_RUN_ARGS = 64;
export const MAX_RUN_ARG_BYTES = 4 * 1024;

const DEFAULT_ALLOWED_CIDRS = [
  '127.0.0.0/8',
  '::1/128',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  'fc00::/7',
  'fe80::/10',
];

export type AppConfig = {
  port: number;
  host: string;
  sessionSecret: string;
  adminUsername: string;
  adminPassword: string | undefined;
  pyappsHome: string;
  allowAllInterfaces: boolean;
  allowedCidrs: string[];
  jobConcurrency: number;
  dataDir: string;
  dbPath: string;
};

function loadEnvFile(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

export function defaultPyappsHome(homedir: () => string = os.homedir): string {
  return path.join(homedir(), 'pyapps');
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { requireSessionSecret?: boolean } = {},
): AppConfig {
  loadEnvFile();
  const requireSessionSecret = options.requireSessionSecret !== false;
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (requireSessionSecret && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET is required and must be at least 32 bytes');
  }

  const dataDir = path.resolve(process.cwd(), 'data');
  const pyappsHome = env.PYAPPS_HOME?.trim()
    ? path.resolve(env.PYAPPS_HOME.trim())
    : defaultPyappsHome();

  const allowedCidrs = (env.ALLOWED_CIDRS ?? DEFAULT_ALLOWED_CIDRS.join(','))
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  return {
    port: Number(env.PORT || DEFAULT_PORT) || DEFAULT_PORT,
    host: (env.HOST || DEFAULT_HOST).trim() || DEFAULT_HOST,
    sessionSecret,
    adminUsername: (env.ADMIN_USERNAME || 'admin').trim() || 'admin',
    adminPassword: env.ADMIN_PASSWORD,
    pyappsHome,
    allowAllInterfaces: parseBool(env.ALLOW_ALL_INTERFACES, false),
    allowedCidrs,
    jobConcurrency: Number(env.JOB_CONCURRENCY || DEFAULT_JOB_CONCURRENCY) || DEFAULT_JOB_CONCURRENCY,
    dataDir,
    dbPath: path.join(dataDir, 'pyapps.sqlite'),
  };
}
