/* Copyright Advanced Software and AI Solutions LLC */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import type { AppConfig } from '../core/config.js';
import { JOB_RATE_PER_MINUTE } from '../core/config.js';
import { openDatabase, type Db } from '../core/db.js';
import { isClientAllowed } from '../core/lan.js';
import { timingSafeEqualString, createFailureTracker, isLockedOut, recordFailure, clearFailures } from '../core/auth.js';
import { writeAudit } from '../core/audit.js';
import {
  getAppBySlug,
  listApps,
  listRecentRuns,
  setSetting,
} from '../core/catalog.js';
import { allActivateCommands } from '../core/activate.js';
import { collectHealth } from '../core/health.js';
import {
  cancelJob,
  enqueueJob,
  getJob,
  listJobs,
  parseInstallSourceBody,
  startJobRunner,
} from '../core/jobs.js';
import { parseRunArgs, parseSlug } from '../core/validators.js';
import { FOOTER_CREDIT } from '../core/copyright.js';
import { authenticate, ensureAdminUser, getUser } from './users.js';
import {
  destroySession,
  findSession,
  rotateSession,
  touchSession,
  validateSession,
} from './sessions.js';
import { resolveHome } from './home.js';

const SESSION_COOKIE = 'pyapps_session';

type AppContext = {
  config: AppConfig;
  db: Db;
  stopJobs: () => void;
};

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    sessionId?: string;
    csrfToken?: string;
    username?: string;
  }
}

function clientIp(request: FastifyRequest): string {
  return request.ip || request.socket.remoteAddress || '';
}

function wantsHtml(request: FastifyRequest): boolean {
  const accept = request.headers.accept ?? '';
  return accept.includes('text/html');
}

async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { db, config } = request.server.ctx;
  const token = request.cookies[SESSION_COOKIE];
  const session = validateSession(findSession(db, config.sessionSecret, token));
  if (!session) {
    if (token) {
      const stale = findSession(db, config.sessionSecret, token);
      if (stale) destroySession(db, stale.id);
    }
    if (wantsHtml(request) && request.method === 'GET') {
      return reply.code(401).type('text/html').send(loginPage(''));
    }
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  touchSession(db, session.id);
  request.sessionId = session.id;
  request.csrfToken = session.csrf_token;
  request.username = getUser(db)?.username ?? 'admin';
}

function requireCsrf(request: FastifyRequest, reply: FastifyReply): void {
  const header = String(request.headers['x-csrf-token'] ?? '');
  const form =
    typeof request.body === 'object' &&
    request.body &&
    'csrf' in (request.body as Record<string, unknown>)
      ? String((request.body as Record<string, unknown>).csrf ?? '')
      : '';
  const token = header || form;
  if (!request.csrfToken || !token || !timingSafeEqualString(token, request.csrfToken)) {
    void reply.code(403).send({ error: 'CSRF validation failed' });
    return;
  }
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        void reply.code(403).send({ error: 'Origin check failed' });
      }
    } catch {
      void reply.code(403).send({ error: 'Origin check failed' });
    }
  }
}

function loginPage(error: string, csrf = ''): string {
  const err = error
    ? `<p role="alert" style="color:#b00020">${escapeHtml(error)}</p>`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sign in - Python Venv Manager</title></head>
<body style="font-family:Segoe UI,sans-serif;max-width:28rem;margin:3rem auto;padding:1rem">
<h1>Python Venv Manager</h1>
<p>Sign in to continue.</p>
${err}
<form method="post" action="/login">
<label style="display:block;margin:.75rem 0">Username
<input name="username" autocomplete="username" required style="display:block;width:100%;min-height:44px;padding:.5rem"/>
</label>
<label style="display:block;margin:.75rem 0">Password
<input name="password" type="password" autocomplete="current-password" required style="display:block;width:100%;min-height:44px;padding:.5rem"/>
</label>
${csrf ? `<input type="hidden" name="csrf" value="${escapeHtml(csrf)}"/>` : ''}
<button type="submit" style="min-height:44px;min-width:44px;padding:.5rem 1rem">Sign in</button>
</form>
<footer style="margin-top:2rem;font-size:.875rem">${escapeHtml(FOOTER_CREDIT)}</footer>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function injectNonce(html: string, nonce: string): string {
  return html
    .replaceAll('<script', `<script nonce="${nonce}"`)
    .replaceAll('<style', `<style nonce="${nonce}"`)
    .replace(
      '</head>',
      `<meta name="csp-nonce" content="${nonce}"/></head>`,
    );
}

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const db = openDatabase(config.dbPath);
  ensureAdminUser(db, config.adminUsername, config.adminPassword);
  const stopJobs = startJobRunner(db, config.jobConcurrency);
  const failures = createFailureTracker();

  const app = Fastify({
    logger: true,
    trustProxy: false,
  });
  app.decorate('ctx', { config, db, stopJobs });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
  });

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      try {
        const params = new URLSearchParams(String(body));
        const out: Record<string, string> = {};
        for (const [key, value] of params.entries()) out[key] = value;
        done(null, out);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.addHook('onRequest', async (request, reply) => {
    if (!isClientAllowed(clientIp(request), config.allowedCidrs)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    const nonce = crypto.randomBytes(16).toString('base64url');
    (request as FastifyRequest & { scriptNonce: string }).scriptNonce = nonce;
    void reply.header(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
    );
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('Referrer-Policy', 'no-referrer');
  });

  const secureCookie = false; // set true when behind HTTPS; SameSite Strict still applies

  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { username?: string; password?: string };
      const username = String(body?.username ?? '');
      const password = String(body?.password ?? '');
      const ip = clientIp(request);
      const ipKey = `ip:${ip}`;
      const userKey = `user:${username.toLowerCase()}`;
      if (isLockedOut(failures, ipKey) || isLockedOut(failures, userKey)) {
        writeAudit(db, { who: username || 'unknown', action: 'login', result: 'locked', ip });
        return reply.code(429).type('text/html').send(loginPage('Too many failed attempts. Try again later.'));
      }
      const user = authenticate(db, username, password);
      if (!user) {
        recordFailure(failures, ipKey);
        recordFailure(failures, userKey);
        writeAudit(db, { who: username || 'unknown', action: 'login', result: 'failure', ip });
        return reply.code(401).type('text/html').send(loginPage('Invalid username or password.'));
      }
      clearFailures(failures, ipKey);
      clearFailures(failures, userKey);
      const old = findSession(db, config.sessionSecret, request.cookies[SESSION_COOKIE]);
      const rotated = rotateSession(db, config.sessionSecret, old?.id, ip);
      void reply.setCookie(SESSION_COOKIE, rotated.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: secureCookie,
      });
      writeAudit(db, { who: user.username, action: 'login', result: 'ok', ip });
      return reply.redirect('/');
    },
  );

  app.post('/logout', { preHandler: requireAuth }, async (request, reply) => {
    requireCsrf(request, reply);
    if (reply.sent) return;
    if (request.sessionId) destroySession(db, request.sessionId);
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    writeAudit(db, {
      who: request.username ?? 'admin',
      action: 'logout',
      result: 'ok',
      ip: clientIp(request),
    });
    return reply.redirect('/login');
  });

  app.get('/login', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    const session = validateSession(findSession(db, config.sessionSecret, token));
    if (session) return reply.redirect('/');
    return reply.type('text/html').send(loginPage(''));
  });

  app.get('/api/session', { preHandler: requireAuth }, async (request) => {
    return {
      username: request.username,
      csrfToken: request.csrfToken,
      footer: FOOTER_CREDIT,
    };
  });

  app.get('/api/health', { preHandler: requireAuth }, async () => collectHealth());

  app.get('/api/apps', { preHandler: requireAuth }, async () => {
    return {
      apps: listApps(db, 'app'),
      projects: listApps(db, 'project'),
    };
  });

  app.get('/api/apps/:slug', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const appRow = getAppBySlug(db, parseSlug(slug));
    if (!appRow) return reply.code(404).send({ error: 'Not found' });
    const runs = listRecentRuns(db, appRow.id);
    const activate = allActivateCommands(appRow.venv_path);
    return { app: appRow, runs, activate };
  });

  app.post(
    '/api/jobs',
    {
      preHandler: requireAuth,
      config: {
        rateLimit: { max: JOB_RATE_PER_MINUTE, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      requireCsrf(request, reply);
      if (reply.sent) return;
      const body = z
        .object({
          type: z.string(),
          slug: z.string().optional(),
          name: z.string().optional(),
          kind: z.enum(['app', 'project']).optional(),
          source: z.unknown().optional(),
          python: z.string().optional(),
          folder: z.string().optional(),
          editable: z.boolean().optional(),
          confirmSlug: z.string().optional(),
        })
        .parse(request.body);
      if (body.type === 'remove') {
        if (!body.slug || body.confirmSlug !== body.slug) {
          return reply.code(400).send({ error: 'Typed slug confirmation required' });
        }
      }
      const home = resolveHome(db, config);
      let source;
      if (body.source) {
        source = parseInstallSourceBody(body.source);
      }
      try {
        const job = enqueueJob(db, {
          type: body.type,
          slug: body.slug,
          name: body.name,
          kind: body.kind,
          source,
          python: body.python,
          folder: body.folder,
          editable: body.editable,
          home,
          who: request.username ?? 'admin',
          ip: clientIp(request),
        });
        return { job };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  app.get('/api/jobs', { preHandler: requireAuth }, async () => ({ jobs: listJobs(db) }));

  app.get('/api/jobs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const job = getJob(db, id);
    if (!job) return reply.code(404).send({ error: 'Not found' });
    return { job };
  });

  app.post('/api/jobs/:id/cancel', { preHandler: requireAuth }, async (request, reply) => {
    requireCsrf(request, reply);
    if (reply.sent) return;
    const id = Number((request.params as { id: string }).id);
    try {
      await cancelJob(db, id, request.username ?? 'admin', clientIp(request));
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/settings', { preHandler: requireAuth }, async () => {
    return {
      home: resolveHome(db, config),
      host: config.host,
      port: config.port,
    };
  });

  app.post('/api/settings', { preHandler: requireAuth }, async (request, reply) => {
    requireCsrf(request, reply);
    if (reply.sent) return;
    const body = z.object({ pyappsHome: z.string().min(1) }).parse(request.body);
    if (body.pyappsHome.startsWith('-')) {
      return reply.code(400).send({ error: 'Invalid home path' });
    }
    const resolved = path.resolve(body.pyappsHome);
    fs.mkdirSync(resolved, { recursive: true });
    setSetting(db, 'pyapps_home', resolved);
    writeAudit(db, {
      who: request.username ?? 'admin',
      action: 'settings.home',
      result: 'ok',
      details: JSON.stringify({ home: resolved }),
      ip: clientIp(request),
    });
    return { home: resolved };
  });

  app.post('/api/runs/validate-args', { preHandler: requireAuth }, async (request, reply) => {
    requireCsrf(request, reply);
    if (reply.sent) return;
    const body = z.object({ args: z.array(z.string()) }).parse(request.body);
    try {
      return { args: parseRunArgs(body.args) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/client');
  if (fs.existsSync(clientDir)) {
    await app.register(fastifyStatic, {
      root: clientDir,
      wildcard: false,
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      await requireAuth(request, reply);
      if (reply.sent) return;
      const nonce = (request as FastifyRequest & { scriptNonce: string }).scriptNonce;
      const indexPath = path.join(clientDir, 'index.html');
      let html = fs.readFileSync(indexPath, 'utf8');
      html = injectNonce(html, nonce);
      return reply.type('text/html').send(html);
    });
  } else {
    app.get('/', { preHandler: requireAuth }, async (_request, reply) => {
      return reply
        .type('text/html')
        .send(
          `<!doctype html><html><body><p>Client build missing. Run npm run build.</p><footer>${escapeHtml(FOOTER_CREDIT)}</footer></body></html>`,
        );
    });
  }

  app.addHook('onClose', async () => {
    stopJobs();
    db.close();
  });

  return app;
}
