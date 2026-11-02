# API runtime

Node.js 22+ HTTP API for PONDOK OS. The current implementation is intentionally dependency-light and does not yet use NestJS.

## Runtime

Required for authenticated routes:

- `DATABASE_URL`: PostgreSQL URL for the same environment as Neon Auth.
- `NEON_AUTH_BASE_URL`: exact issuer/base URL from that Neon Auth branch.
- `NEON_AUTH_JWKS_URL`: exact JWKS URL from that same branch.
- `PORT`: optional, defaults to 3001.

Endpoints currently implemented:

- `GET /health/live`: process liveness only.
- `GET /v1/tenant/context`: verify Neon JWT, active organization membership, and resolve server-side roles/permissions.
- `GET /v1/academic/students`: permission-gated, tenant-scoped student listing.
- `POST /v1/academic/students`: permission-gated student creation.

The liveness endpoint does not prove database readiness. Authentication and business routes fail closed if their dependencies are not configured.

## Bootstrap the first institution owner

This command is an explicit one-time operation; it is never run by CI or API startup. First apply migrations through 0009 to the intended non-production database and create the initial user in that same branch's Neon Auth.

```powershell
$env:DATABASE_URL = "<development database URL>"
$env:PONDOK_BOOTSTRAP_CONFIRM = "CREATE_ORGANIZATION"
pnpm --filter @pondok-os/api db:bootstrap -- --user-id "<existing Neon Auth user UUID>" --slug "pondok-contoh" --name "Pondok Contoh" --campus-code "UTAMA" --campus-name "Kampus Utama"
```

The bootstrap transaction verifies that the supplied user already exists in `neon_auth."user"`, creates one organization and campus, adds an active membership, assigns the global `institution_owner` role, and records an audit event. It fails on duplicate slugs/codes rather than silently changing existing institutions.

Do not paste database URLs or credentials into tickets or chat. Do not point this command at production until a separately reviewed production onboarding procedure exists.

## Migrations

Run `pnpm db:migrate` only after checking the target connection string and reconciling any manually applied schema objects with `core.schema_migrations`. The runner serializes execution, verifies SHA-256 checksums, and applies each migration in its own transaction.
