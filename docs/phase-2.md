# Phase 2 plan: notices, bulk import, schedules, catalog export

Branch: `cursor/venv-manager-phase2-509c` (off `main` at Phase 1B merge).
Stack stays Phase 1: Node as installed, TypeScript, Fastify, `node:sqlite`, Vite, React, MUI, zod. No new runtime dependency unless we ask first.

## Goal

Make the catalog easier to keep current and operate unattended on the LAN: know when PyPI/GitHub apps have updates, import many existing venvs at once, run presets on a schedule, and export the catalog as JSON.

## Defaults

| Topic | Choice |
|---|---|
| Schema changes | Additive migrations via `meta.schema_version` in `migrate()` |
| Update checks | Job type `check-updates`; uses allowlisted `uv` only |
| Bulk import | Job type `register-bulk`; extends existing `register` |
| Schedules | Table + in-process ticker (same pattern as job runner); prefer preset-backed runs |
| Run source | Add `schedule` to `runs.source` CHECK |
| Catalog export | Auth `GET` JSON; apps + presets; omit sessions, secrets, run/job logs |
| CLI | Optional `pyapp export` (read-only); no install/remove |
| Security | Keep login, CSRF on writes, ALLOWED_CIDRS, spawn allowlist, redaction, CSP |

## Tasks

### 1. Schema migration helper

- Version `meta.schema_version`.
- Apply additive `ALTER TABLE` / new tables safely on existing DBs.
- Touch: [src/core/db.ts](../src/core/db.ts).

### 2. Update-available notices

- Columns on `apps` (or side table): `remote_version`, `update_checked_at`, `update_available`.
- Job `check-updates` (one slug or all eligible apps).
- PyPI/GitHub only; skip or mark N/A for `registered` / unpinned local.
- Compare to installed `version`; surface on Dashboard and Detail; existing Update button still enqueues `update`.
- New module [src/core/updates.ts](../src/core/updates.ts); wire [src/core/jobs.ts](../src/core/jobs.ts), [src/server/app.ts](../src/server/app.ts), Dashboard/Detail UI.
- Audit `job.check-updates`.

### 3. Bulk import of existing venvs

- Enrich single `register` to inspect entry points/version when possible (today leaves them empty).
- Job `register-bulk`: list of absolute folders and/or a scan root for `*/.venv/pyvenv.cfg`.
- Preview in UI (slug, path, collision); then enqueue.
- Disable or clearly label Update/Repair for `registered` when no rebuildable source exists.
- Touch: jobs, validators, Add wizard or Import page, tests.

### 4. Scheduled runs

- Table `schedules`: `app_id`, optional `preset_id`, entry/args, `interval_minutes` or simple cron subset, `next_run_at`, `enabled`, optional absolute `cwd`.
- Core [src/core/schedules.ts](../src/core/schedules.ts); ticker started from `buildApp` beside the job runner.
- Due rows call the same spawn path as web runs (`startWebRun` or shared helper) with `who: 'scheduler'` and `source: 'schedule'`.
- Skip if that app already has an active run/job.
- UI: CRUD on Detail or a Schedules page; enable/disable; show next run.
- Document that the server process must be running (no OS Task Scheduler).

### 5. Catalog export

- [src/core/export.ts](../src/core/export.ts): JSON of apps (+ presets); no passwords, sessions, or logs.
- `GET /api/catalog/export` (session required).
- Settings or Dashboard download button; optional `pyapp export`.
- Keep `npm run backup` as full SQLite disaster recovery (separate from catalog export).
- Import of export JSON is out of scope unless added as a follow-on.

### 6. Docs and tests

- Update README, AGENTS.md, security notes where schedules/export change the model.
- Vitest: update compare logic, bulk path validation, schedule due/skip, export shape (no secrets), auth on export GET.

## Build sequence (small commits)

1. Migration helper + schema for updates/schedules/`runs.source`.
2. Update check job + UI badges.
3. Register enrich + bulk import job + UI.
4. Schedules core, ticker, APIs, UI.
5. Catalog export API + UI (+ optional CLI).
6. Docs, COMMANDS, PR to `main` (do not merge).

## Out of scope (Phase 3)

Per-app env vars with hidden secrets, favorites launcher, lock file view, formal accessibility audit.

## Accept

- COMMANDS pass; no Node pin, containers, or personal data in the repo.
- Dashboard shows update-available for a checked PyPI app; Update still works.
- Bulk import registers multiple valid venvs and skips collisions safely.
- A enabled schedule fires a run into history with source `schedule` while the server is up.
- Export downloads catalog JSON without secrets; backup remains available.
