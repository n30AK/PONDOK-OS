# PONDOK OS Web Workspace

React + Vite administrative workspace with Neon Managed Auth, guarded first-institution setup, tenant context, student listing/creation, and an installable PWA shell.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Keep `VITE_NEON_AUTH_URL` pointed at the Neon **development** branch. Never point a local test build at production.
3. Start the API with `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_JWKS_URL` configured for the same development branch.
4. From the repository root run `pnpm --filter @pondok-os/web dev`.

The Vite proxy forwards `/v1` and `/health` to `http://127.0.0.1:3001`. Set `API_PROXY_TARGET` to override it.

## Authentication and first institution setup

- Email/password sign-in uses the official `@neondatabase/auth` client.
- The browser requests a short-lived JWT using `authClient.token()`.
- Every protected API call includes the bearer token and selected `x-organization-id`.
- Organization membership and permissions are resolved server-side; the UI does not trust client role claims.
- Public sign-up is not exposed as a general registration route. A dedicated first-setup flow is available only for initial institution initialization and requires a one-time server-side token. Follow [the first-install runbook](../../docs/runbooks/first-install.md).

## PWA / offline boundary

The service worker caches the application shell only. It does **not** cache student records, queue offline writes, or synchronize local/cloud data. Do not use this shell as an offline-first production client until the local database, transactional outbox, sync conflict workflow, and restore drills are implemented and tested.

## Deployment

Build with `pnpm --filter @pondok-os/web build`. Configure `VITE_NEON_AUTH_URL` to the matching Neon branch and `VITE_API_URL` to the API origin. The API must allow the deployed origin via `CORS_ALLOWED_ORIGINS`. Register the web origin in Neon Auth trusted domains before OAuth redirects are used.
