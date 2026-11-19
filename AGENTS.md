# Agent notes for Python Venv Manager

## Stack

- Node (whatever is installed; do not pin), TypeScript, Fastify, `node:sqlite`
- Vite + React + MUI + Emotion SPA
- `uv` for all Python work; never pin Python or uv versions
- `zod` validates all input

## House rules

- No `engines` field, no `.nvmrc`, no Node version numbers in repo files
- CI workflows: `workflow_dispatch` only; `setup-node` with `node-version: latest`
- Native npm, Windows first; no containers or container docs
- Public repo: placeholders only for paths, usernames, IPs, secrets
- `.env` is gitignored; never commit secrets
- CSP with per-request nonce; never `unsafe-inline` or `unsafe-eval`
- Spawn with `shell: false` and argument arrays only
- Allowlist: `uv`, `git`, `taskkill`, registered venv python or entry points
- Reject user values that start with a hyphen when used as spawn args
- No em or en dashes in visible copy (`npm run lint:copy`)
- Copyright Advanced Software and AI Solutions LLC in source headers and footer

## Layout

- `src/core/` must not import Fastify or React
- `src/server/` Fastify app and routes
- `src/client/` SPA
- `src/cli/` and `bin/pyapp` read SQLite directly; CLI never installs or removes

## Phase scope

- 1A: auth, LAN guard, uv install/catalog, CLI, polled job status
- 1B: live runs, history UI, presets, audit viewer, motion polish
