/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('SSE auth', () => {
  it('returns 401 without a session', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-sse-'));
    dirs.push(dir);
    const app = await buildApp({
      port: 3000,
      host: '127.0.0.1',
      sessionSecret: 'x'.repeat(32),
      adminUsername: 'admin',
      adminPassword: 'test-password-not-logged',
      pyappsHome: path.join(dir, 'home'),
      allowAllInterfaces: false,
      allowedCidrs: ['127.0.0.0/8', '::1/128'],
      jobConcurrency: 1,
      dataDir: dir,
      dbPath: path.join(dir, 'db.sqlite'),
    });
    const res = await app.inject({ method: 'GET', url: '/api/jobs/1/events', remoteAddress: '127.0.0.1' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
