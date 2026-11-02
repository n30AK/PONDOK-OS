# Container deployment (cloud-connected mode)

This deployment packages the API and PWA web workspace in Docker. PostgreSQL and Neon Managed Auth remain external managed services; both URLs must refer to the same Neon branch. This is not an offline/local-only deployment.

## Requirements

- Docker Engine + Docker Compose plugin.
- Node 22 is used in the image build.
- A PostgreSQL database with the PONDOK OS migrations applied.
- Neon Managed Auth enabled on that same branch.
- A trusted web origin configured in Neon Auth.
- A TLS reverse proxy in front of the web port for production.

## Configure

1. Copy `.env.compose.example` to `.env`.
2. Set `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_JWKS_URL` from the same Neon branch. Never mix URLs from different branches.
3. Set `CORS_ALLOWED_ORIGINS` to the exact public HTTPS origin used by the browser.
4. Ensure the database migration ledger matches the repository before running the migration profile.
5. Keep the populated `.env` private and outside version control.

For the first institution only, follow [the first-install runbook](../runbooks/first-install.md). Generate a one-time token locally using `node scripts/create-bootstrap-token.mjs`, configure only the digest as `PONDOK_BOOTSTRAP_TOKEN_SHA256`, and enter the raw token once in the first-setup screen. Remove the digest from the API environment immediately after initialization.

## Build and run

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f api
```

Open `http://localhost:8080` for a local smoke test. For public access, terminate TLS at a reverse proxy and use a trusted HTTPS origin.

## Explicit migration operation

Migrations are deliberately not run automatically when containers start.

```bash
docker compose --profile migration run --rm migrate
```

Run this only after verifying the target branch and checking that any pre-existing tables have been reconciled. The runner uses checksums and stops if a previously recorded migration has changed.

## Health checks

- `/health/live` confirms the API process responds.
- `/health/ready` confirms the configured PostgreSQL connection answers a query.
- Neither endpoint proves that Neon Auth sign-in or every business workflow works.

## Current limits

- The first PWA caches only the static application shell.
- No student data is cached offline.
- No local authentication server or offline-first PostgreSQL provisioning is included.
- Hybrid sync currently accepts authenticated events into a pending inbox; a domain-specific processor, local outbox, conflict review UI and end-to-end LAN/WAN tests are still required.
- The mobile Flutter apps, Tauri desktop installer, kiosk mode and commercial Control Center are not yet production deliverables.
