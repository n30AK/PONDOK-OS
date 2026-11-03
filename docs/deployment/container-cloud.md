# Container deployment (cloud-connected mode)

This deployment packages the API and PWA web workspace in Docker. PostgreSQL and Neon Managed Auth remain external managed services; both URLs must refer to the same Neon branch. This is not an offline/local-only deployment.

## Requirements

- Docker Engine + Docker Compose plugin.
- Node 22 is used in the image build.
- A Neon PostgreSQL branch with Neon Managed Auth enabled on that same branch.
- A trusted web origin configured in Neon Auth.
- A TLS reverse proxy in front of the web port for production.
- An API build that includes transaction-scoped tenant context and the RLS-compatible first-organization bootstrap.

## Configure

1. Copy `.env.compose.example` to `.env`.
2. Set `DATABASE_URL` to the managed admin/owner connection string for migration and controlled operator CLI only.
3. Set `PONDOK_DATABASE_URL` to the dedicated `pondok_app` login role with `NOBYPASSRLS`, `NOINHERIT`, and no superuser/database/role-creation privileges. This is the only database URL the API container may use.
4. Set `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` from the same Neon branch. Never mix URLs from different branches.
5. Set `CORS_ALLOWED_ORIGINS` to the exact public HTTPS origin used by the browser.
6. Ensure the database migration ledger and any manually created schema objects have been reconciled before migration.
7. Keep the populated `.env` private and outside version control.

For the first institution only, follow [the first-install runbook](../runbooks/first-install.md). Generate a one-time token locally using `node scripts/create-bootstrap-token.mjs`, configure only the digest as `PONDOK_BOOTSTRAP_TOKEN_SHA256`, and enter the raw token once in the first-setup screen. Remove the digest from the API environment immediately after initialization.

## Build and run

Deploy the API/web image containing the current tenant transaction context and restricted `PONDOK_DATABASE_URL` before activating migrations 0013/0014:

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f api
```

Open `http://localhost:8080` for a local smoke test. For public access, terminate TLS at a reverse proxy and use a trusted HTTPS origin. Do not expose tenant-facing traffic until the migration and live authentication checks have completed.

## Explicit migration operation

Migrations are deliberately not run automatically when containers start. After the matching API build is running, apply pending migrations to the explicitly verified development or staging branch:

```bash
docker compose --profile migration run --rm migrate
```

On the current PONDOK OS development branch, migrations 0001–0012 are recorded and 0013/0014 are pending. Verify that `pondok_app.rolbypassrls=false`, that all 60 organization-owned tables have ENABLE + FORCE RLS, and that the core organization/membership authority policies are present. The managed owner `DATABASE_URL` has BYPASSRLS and must never be used by the API runtime. Never run this development procedure against the production branch.

The runner uses checksums and stops if a previously recorded migration has changed.

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
