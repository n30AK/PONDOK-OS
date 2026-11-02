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
2. Set `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_JWKS_URL` from the same development or production branch. Never mix URLs from different branches.
3. Ensure the database has the required migrations. Existing manually created objects must be reconciled with `core.schema_migrations` before running the migration profile.
4. Set a strong database credential and keep `.env` outside version control.

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

Run this only after verifying the target Neon branch and checking that any pre-existing tables have been reconciled. The runner uses checksums and will stop if a previously recorded migration has changed.

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
