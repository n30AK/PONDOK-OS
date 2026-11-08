# API runtime

Node.js 22+ HTTP API for PONDOK OS. The current implementation is intentionally dependency-light and does not yet use NestJS.

## Runtime configuration

Authenticated routes require:

- `DATABASE_URL`: PostgreSQL URL for the same environment as Neon Auth.
- `NEON_AUTH_BASE_URL`: exact issuer/base URL from that Neon Auth branch.
- `NEON_AUTH_JWKS_URL`: exact JWKS URL from that same branch.
- `PORT`: optional, defaults to 3001.
- `CORS_ALLOWED_ORIGINS`: comma-separated exact browser origins for deployed clients.

Never commit populated environment files or print database URLs in logs. Never mix Auth URLs and database URLs from different Neon branches.

## Implemented endpoint groups

- `GET /health/live`: process liveness.
- `GET /health/ready`: database connectivity readiness; this does not prove schema completeness or business workflow acceptance.
- `GET /v1/tenant/context`: verify Neon JWT, active organization membership, and resolve server-side roles/permissions.
- `/v1/academic/*`: student and academic foundation endpoints.
- `/v1/finance/*`: chart of accounts, fiscal periods and journal workflows.
- `/v1/inventory/*`: item, warehouse and stock movement operations.
- `/v1/hr/*`: employee and payroll period/run workflows.
- `/v1/sync/*`: authenticated device and pending event inbox foundation.
- `/v1/modules/*`: tenant-scoped module resources, including student identity/health and guardian-authority verification routes where their schema and secrets are available.
- `/v1/platform/*`: company Central Command and activation-control routes.

Each protected operation must verify identity, active organization membership or platform Super Admin authority, and the required permission. Tenant-owned queries must include organization scope. Authenticated tenant handlers use a checked-out PostgreSQL connection and transaction-local tenant context; runtime database roles are restricted to prevent owner-level RLS bypass.

## Development deployment snapshot (2026-11-08)

- Neon project: `frosty-cherry-92983148`.
- Development branch: `br-proud-paper-b312lfxi`.
- Function: `pondokapi`, deployment #43, Node.js 24.
- Live catalog: 67 tables with `organization_id`; 67/67 have RLS enabled and forced.
- Live migration ledger: through 0026. Migrations 0024–0026 were applied to Development on 2026-11-08 in one atomic transaction with an advisory lock; source-file SHA-256 checksums are recorded.
- `STUDENT_HEALTH_ENCRYPTION_KEY` is present. `STUDENT_IDENTITY_ENCRYPTION_KEY` is absent; identity-document operations must remain fail-closed until securely provisioned.
- No organizations, memberships, student profiles or HR employees exist yet.
- Live two-tenant API acceptance and institution UAT are pending.

The Development deployment workflow and deployment script are scoped to the Development project/branch. Do not repoint them to Production as part of routine work. Production branch `br-late-cherry-b3uqtuvh` must remain untouched.

## Database row-level security

The Development catalog audit verifies ENABLE + FORCE RLS for all 67 tables carrying `organization_id`. This is a database catalog result, not a substitute for API-level authorization testing. CI exercises RLS behavior against disposable PostgreSQL; live two-tenant API acceptance still requires two independently authenticated users and two actual non-production organizations.

## Migrations

Run `pnpm db:migrate` only after:
1. Confirming the exact target is the approved Development branch.
2. Reviewing the ordered migration files and checksums.
3. Reconciling manually applied objects with `core.schema_migrations`.
4. Confirming a recoverable backup/restore point and an approved execution window.

The runner serializes execution with a PostgreSQL advisory lock, verifies SHA-256 checksums, and applies each migration in its own transaction. Never run it against Production as part of this project workflow. Do not manually patch schema objects to bypass the migration ledger.

Migrations 0024, 0025 and 0026 are recorded as applied on Development as of 2026-11-08. The application was scoped to branch `br-proud-paper-b312lfxi`, preflighted against the expected 0023 ledger and absent target objects, guarded by an advisory lock, and committed atomically. SHA-256 checksums were computed from the exact repository file contents and stored in `core.schema_migrations`. Migration 0026 supplies the guardian-authority verification column and permission. Production was not targeted.

## Central activation and company administration

The distribution model uses company approval. New institutions submit an authenticated activation request; the request does not itself create a tenant or membership. A company Super Administrator approves or rejects it through Central Command.

- `GET /v1/platform/admin/me`: reports whether the authenticated user has an active company Super Admin grant.
- `POST /v1/platform/activation-requests`: submits an institution request bound to the authenticated user.
- `GET /v1/platform/activation-requests/mine`: lists the caller's own requests.
- `GET /v1/platform/admin/activation-requests`: lists requests for company operators.
- `POST /v1/platform/admin/activation-requests/:id/approve`: approves a pending request and returns a one-time activation token; the database stores its SHA-256 digest.
- `POST /v1/platform/admin/activation-requests/:id/reject`: rejects a pending request with a recorded reason.
- `POST /v1/platform/activate`: redeems the user-bound token and creates the organization, owner membership, main campus, owner role and audit event in one transaction.

Tenant creation requires the institution's actual details and an authorized Super Administrator. Never create fake tenants, memberships, students, guardians or employees for demonstration. The operator account `akviso` is not a tenant member and must not be granted a tenant role.

## Student identity encryption

The identity-document API expects `STUDENT_IDENTITY_ENCRYPTION_KEY` to decode from base64 to exactly 32 bytes. The key is not currently present in the Development Function environment. Do not enable identity-document writes until secure secret provisioning, recoverable encrypted backup and rotation/recovery procedures are in place. Never put key material in source control, logs or chat.

## Readiness boundary

A successful build, deployment, `/health/live`, `/health/ready`, or catalog RLS query does not mean PONDOK OS is ready for institutional operations. Readiness requires an actual institution tenant, two-tenant API isolation, role-based end-to-end workflows, backup/restore validation and institution UAT.
