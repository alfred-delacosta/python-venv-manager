# Security model

Python Venv Manager is a single-user, self-hosted app for a trusted LAN or loopback interface.

## Authentication

- One admin account is created on first start from `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
- The password is stored as a scrypt hash with a random salt. Env password values are not kept after bootstrap.
- Sessions are server-side rows in SQLite, referenced by an HttpOnly cookie (`SameSite=Strict`, `Secure` when served over HTTPS).
- Idle timeout is 8 hours. Login rotates the session token.
- Login failures are limited to 5 per 15 minutes per IP and per username.
- Every page and API requires a session. There are no anonymous reads.

## CSRF and Origin

- Mutating requests require the session CSRF token in `X-CSRF-Token` (or a `csrf` form field).
- When an `Origin` header is present, it must match the request `Host`.

## Network binding

- Default bind is `127.0.0.1:3000`.
- Public hosts are refused. Binding `0.0.0.0` or `::` requires `ALLOW_ALL_INTERFACES=true`.
- Client IPs outside `ALLOWED_CIDRS` receive HTTP 403.

## Process safety

- Child processes use `spawn` with `shell: false` and argument arrays only.
- Allowlisted commands: `uv`, `git`, `taskkill`, and registered venv python or entry points.
- On Windows, only `.exe` entry points are launched directly.
- Package names, slugs, paths, and refs that start with a hyphen are rejected.
- Job and run logs are secret-redacted and capped at 1 MB.

## Content Security Policy

- HTML responses include a per-request CSP nonce for `script-src` and `style-src`.
- `object-src` is `none` and `frame-ancestors` is `none`.
- `unsafe-inline` and `unsafe-eval` are never used.

## Audit

- Login, login failure, logout, setting changes, jobs, and runs are appended to `audit_log`.
- The audit viewer UI is deferred to a later phase.
