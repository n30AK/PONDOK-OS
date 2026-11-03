# API runtime

Node.js 22+ HTTP API for PONDOK OS. The current implementation is intentionally dependency-light and does not yet use NestJS.

## Runtime configuration

Authenticated API runtime requires:

- `PONDOK_DATABASE_URL`: PostgreSQL URL for the dedicated `pondok_app` role (NOBYPASSRLS, NOINHERIT). This is the only database URL the API process may use.
- `NEON_AUTH_BASE_URL`: exact issuer/base URL from that Neon Auth branch.
- `NEON_AUTH_JWKS_URL`: exact JWKS URL from that same branch.
- `PORT`: optional, defaults to 3001.
- `CORS_ALLOWED_ORIGINS`: comma-separated exact browser origins for deployed clients.
- `PONDOK_BOOTSTRAP_TOKEN_SHA256`: temporary SHA-256 digest for first-organization setup only; remove immediately after initialization.

`DATABASE_URL` is reserved for the migration runner and controlled operator CLI. Neon Functions automatically injects a managed-owner `DATABASE_URL`; the function adapter intentionally ignores it because the owner role has BYPASSRLS. Never use that owner URL for the API runtime.

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

Each protected operation verifies identity, active organization membership and the required permission. Tenant-owned queries also include organization scope. Authenticated tenant handlers run on one checked-out PostgreSQL connection and set `app.user_id` and `app.organization_id` with transaction-local scope before membership lookup and tenant queries.

## Database row-level security

Migration `0013_tenant_row_level_security.sql` enables and forces RLS for 60 organization-owned tables across 15 schema groups. Dedicated policies also protect `core.organizations`, `core.organization_memberships`, and `core.membership_roles`. The membership predicate function is owned by a separate `pondok_rls_owner` NOLOGIN/NOBYPASSRLS helper role so its reads are subject to membership RLS; the API role only receives EXECUTE.

Migration `0014_application_runtime_role.sql` creates/grants `pondok_app` as NOBYPASSRLS, NOINHERIT, non-superuser, non-admin. It grants runtime access to domain tables while keeping global RBAC dictionaries read-only and denying access to `core.schema_migrations`. Initial owner assignment is performed by a narrow SECURITY DEFINER helper; the application role cannot directly insert or change role assignments.

**Important:** migrations 0013 and 0014 are present in the repository but have not yet been applied to Neon development. The matching API build must be deployed and configured with `PONDOK_DATABASE_URL` before activating these migrations. Do not apply them to production without an approved production-readiness gate.

## First institution setup

See [First institution installation](../../docs/runbooks/first-install.md). Generate the one-time token locally:

```bash
node scripts/create-bootstrap-token.mjs
```

Only its SHA-256 digest belongs in the API environment. The raw token is entered once in the web setup form. Remove the digest from the API environment immediately after success. The endpoint refuses to create a second organization.

The API bootstrap runs one transaction: it checks the global first-organization gate through a narrow definer helper, sets verified user/tenant context, inserts the organization and self-membership under RLS, creates the main campus, calls the one-time initial-owner helper, and appends the audit event. The helper only assigns the system owner role to the sole active member of a tenant with no prior role assignments.

The operator CLI bootstrap follows the same transaction/context sequence. It uses the admin `DATABASE_URL` only for controlled operator setup and verifies the supplied user exists in `neon_auth."user"`.

## Migrations

Run `pnpm db:migrate` only with the explicitly intended admin `DATABASE_URL`, after checking the target branch and reconciling manually applied objects with `core.schema_migrations`. The runner serializes execution, verifies SHA-256 checksums, and applies each migration in its own transaction. Deploy the matching API build and configure its restricted `PONDOK_DATABASE_URL` before applying migrations 0013/0014.
