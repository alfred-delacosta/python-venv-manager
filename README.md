# Python Venv Manager

A local, self-hosted app to install, track, and run Python programs, each in its own venv, using [uv](https://docs.astral.sh/uv/).

Why: Python tools and projects scatter across machines, activate commands are easy to forget, and packages conflict. This app keeps a catalog of Apps (CLI tools) and Projects (coding project venvs).

## Requirements

- Node.js already installed on the machine (any current version; this repo does not pin one)
- npm
- [uv](https://docs.astral.sh/uv/getting-started/installation/) for Python installs (the Health page shows install commands if uv is missing)
- git (for GitHub sources)

## Quick start

```bash
npm install
copy .env.example .env
```

Edit `.env` and set a long `SESSION_SECRET` plus a first-run `ADMIN_PASSWORD`.

```bash
npm run build
npm start
```

Open `http://127.0.0.1:3000` and sign in.

Development:

```bash
npm run dev
```

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address (LAN IP for LAN access) |
| `SESSION_SECRET` | (required) | At least 32 bytes; signs session tokens |
| `ADMIN_USERNAME` | `admin` | First-run username only |
| `ADMIN_PASSWORD` | (required first run) | First-run password only; stored as scrypt hash |
| `PYAPPS_HOME` | `<homedir>/pyapps` | Where app venvs live |
| `ALLOW_ALL_INTERFACES` | `false` | Allow binding `0.0.0.0` / `::` |
| `ALLOWED_CIDRS` | loopback + private | Client IPs outside these get 403 |
| `JOB_CONCURRENCY` | `2` | Parallel jobs |

## CLI (`pyapp`)

The CLI reads the SQLite catalog on the same machine. It does not install or remove packages.

```bash
npm link
pyapp list
pyapp path <app>
pyapp activate <project> --shell powershell
pyapp run <app> -- --help
```

On Windows you can also add a `.cmd` shim on your PATH. Elsewhere, link into `~/.local/bin`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite + Fastify watch mode |
| `npm run build` | Build client and server |
| `npm start` | Run the production server |
| `npm run lint` | ESLint |
| `npm run lint:copy` | Fail on em/en dashes in copy |
| `npm run typecheck` | TypeScript checks |
| `npm test` | Vitest |
| `npm run admin:reset-password` | Prompt for a new admin password |
| `npm run backup` | `VACUUM INTO` a timestamped SQLite copy |

## Docs

- [Security model](docs/security.md)
- [LAN access](docs/lan-access.md)

## License notice

Copyright Advanced Software and AI Solutions LLC
