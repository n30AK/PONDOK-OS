# API runtime

Node.js 22+ HTTP API for PONDOK OS. The current implementation is intentionally dependency-light and does not yet use NestJS.

## Runtime configuration

Authenticated routes require:

- `DATABASE_URL`: PostgreSQL URL for the same environment as Neon Auth.
- `NEON_AUTH_BASE_URL`: exact issuer/base URL from that Neon Auth branch.
- `NEON_AUTH_JWKS_URL`: exact JWKS URL from that same branch.
- `PORT`: optional, defaults to 3001.
- `CORS_ALLOWED_ORIGINS`: comma-separated exact browser origins for deployed clients.
- `PONDOK_BOOTSTRAP_TOKEN_SHA256`: temporary SHA-256 digest for first-organization setup only; remove immediately after initialization.

Never commit populated environment files or print database URLs in logs.

## Implemented endpoint groups

- `GET /health/live`: process liveness.
- `GET /health/ready`: database readiness.
- `POST /v1/bootstrap/organization`: guarded first-tenant setup with verified Neon JWT and one-time setup token.
- `GET /v1/tenant/context`: verify Neon JWT, active organization membership, and resolve server-side roles/permissions.
- `/v1/academic/*`: student list/create endpoints.
- `/v1/finance/*`: chart of accounts, fiscal periods, journal draft creation/listing, posting and period close.
- `/v1/inventory/*`: item, warehouse and stock movement operations.
- `/v1/hr/*`: employee and payroll period/run workflows, approval and payment transitions.
- `/v1/sync/*`: authenticated device and pending event inbox foundation.

Each protected operation verifies identity, active organization membership and the required permission. Tenant-owned queries also include organization scope. Authenticated tenant handlers run on one checked-out PostgreSQL connection and set `app.user_id` and `app.organization_id` with transaction-local scope.

## Database row-level security

Migration `0013_tenant_row_level_security.sql` enables and forces RLS for 59 organization-owned tables across 15 schema groups. Policies require both the selected organization and an active membership for the verified API user. CI tests the policies using a restricted non-owner PostgreSQL role, including cross-tenant read/write denial and first-bootstrap writes under FORCE RLS.

**Development status (2026-11-03):** migrations 0013 and 0014 have been applied and verified on Neon Development. The API is deployed as Neon Function deployment #4 (Node.js 24); `/health/live` and `/health/ready` both pass. Authenticated tenant transactions execute `SET LOCAL ROLE pondok_runtime` before setting tenant context, preventing the `neondb_owner` BYPASSRLS connection from bypassing tenant policies. Production remains untouched. Live sign-in/bootstrap and two-tenant API acceptance are still pending.

The table `core.organization_memberships` is intentionally excluded as the membership authority to avoid recursive policy evaluation. The API resolves membership using the verified JWT subject and selected organization. Direct database access to this table remains a separate hardening boundary.

## First institution setup

See [First institution installation](../../docs/runbooks/first-install.md). Generate the one-time token locally:

```bash
node scripts/create-bootstrap-token.mjs
```

Only its SHA-256 digest belongs in the API environment. The raw token is entered once in the web setup form. Remove the digest from the API environment immediately after success. The endpoint refuses to create a second organization.

The API bootstrap now uses ordered statements in one transaction: it creates the organization and owner membership under the elevated bootstrap transaction, sets transaction-local tenant context, then switches to `pondok_runtime` before creating the main campus, owner role assignment and audit event. This is required for campus and audit RLS policies after migration 0013. Migration 0014 grants the restricted role only the necessary schema/table/sequence privileges.

The separate CLI bootstrap command remains available for controlled operator workflows:

```powershell
$env:DATABASE_URL = "<development database URL>"
$env:PONDOK_BOOTSTRAP_CONFIRM = "CREATE_ORGANIZATION"
pnpm --filter @pondok-os/api db:bootstrap -- --user-id "<existing Neon Auth user UUID>" --slug "pondok-contoh" --name "Pondok Contoh" --campus-code "UTAMA" --campus-name "Kampus Utama"
```

Only run the CLI against the explicitly intended non-production branch. It verifies the user exists in `neon_auth."user"`, creates the tenant/membership/campus/owner assignment and audit event in one transaction.

## Migrations

Run `pnpm db:migrate` only after checking the target connection string and reconciling any manually applied schema objects with `core.schema_migrations`. The runner serializes execution, verifies SHA-256 checksums, and applies each migration in its own transaction. For a branch moving to migration 0013, deploy the matching API build first.
