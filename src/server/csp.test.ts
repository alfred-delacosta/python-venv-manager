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

async function makeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-csp-'));
  dirs.push(dir);
  return buildApp({
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
}

describe('CSP and SPA nonce', () => {
  it('login HTML uses a nonced style element and allows style attributes in CSP', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/login',
      remoteAddress: '127.0.0.1',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(200);
    const csp = String(res.headers['content-security-policy'] ?? '');
    expect(csp).toMatch(/style-src-elem 'self' 'nonce-[^']+'/);
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp).not.toMatch(/(?:^|; )style-src (?!attr|elem)[^;]*'unsafe-inline'/);
    const nonceMatch = csp.match(/script-src 'self' 'nonce-([^']+)'/);
    expect(nonceMatch).toBeTruthy();
    const nonce = nonceMatch![1];
    expect(res.body).toContain(`meta name="csp-nonce" content="${nonce}"`);
    expect(res.body).toContain(`<style nonce="${nonce}">`);
    expect(res.body).not.toMatch(/style="/);
    await app.close();
  });

  it('serves / with csp-nonce meta when the client build exists', async () => {
    const clientIndex = path.resolve('dist/client/index.html');
    if (!fs.existsSync(clientIndex)) {
      return;
    }
    const app = await makeApp();
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      remoteAddress: '127.0.0.1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'username=admin&password=test-password-not-logged',
    });
    const cookie = String(login.headers['set-cookie'] ?? '')
      .split(';')[0]
      .trim();
    expect(cookie).toContain('pyapps_session=');

    const res = await app.inject({
      method: 'GET',
      url: '/',
      remoteAddress: '127.0.0.1',
      headers: { accept: 'text/html', cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('name="csp-nonce"');
    const csp = String(res.headers['content-security-policy'] ?? '');
    const nonceMatch = csp.match(/script-src 'self' 'nonce-([^']+)'/);
    expect(nonceMatch).toBeTruthy();
    expect(res.body).toContain(`content="${nonceMatch![1]}"`);
    expect(res.body).toMatch(/<script[^>]*nonce=/);
    await app.close();
  });
});
