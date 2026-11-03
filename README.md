# PONDOK OS

Integrated operating system for pesantren and Islamic boarding schools.

PONDOK OS is being developed as a configurable modular platform for academic management, student affairs, boarding, finance, accounting, inventory, procurement, assets, HR/payroll, library, PPDB, CMS, CRM, and institution operations. The commercial Control Center is designed as a separate security plane from institution-owned records.

## Current implementation snapshot

The repository currently contains:

- TypeScript monorepo foundation and PostgreSQL migration runner with checksums and advisory locking.
- Neon Managed Auth JWT verification and server-side organization membership/permission resolution.
- Guarded first-institution setup flow using a one-time server-side SHA-256 token.
- Transaction-scoped tenant context for authenticated API requests.
- Tenant isolation migration using FORCE ROW LEVEL SECURITY for 60 organization-owned tables across 15 schema groups, plus dedicated policies for the organization registry and membership-role authority.
- A dedicated `pondok_app` runtime role designed with NOBYPASSRLS, NOINHERIT and no database/role creation privileges; the API must not use the managed owner role.
- CI integration tests for fail-closed tenant context, cross-tenant read/write isolation, restricted-role privileges, protected authority tables, and the first-institution bootstrap sequence under RLS.
- Tenant-scoped API foundations for student records, finance journals, inventory items/warehouses/stock movements, HR employees and payroll transitions.
- Indonesian React/Vite admin workspace with Neon Auth sign-in, first setup, tenant selection, student list/create, and initial finance/inventory/HR list + basic-record creation screens.
- PostgreSQL domain foundations for library, PPDB, CMS, boarding, procurement, fixed assets, CRM and hybrid sync.
- Global system role templates and bootstrap workflows.
- PWA shell caching, Docker images, Nginx reverse proxy and Compose deployment for cloud-connected mode.
- CI executes migrations on disposable PostgreSQL 18, typechecks, builds workspaces and containers, bundles the Neon Functions API and runs unit tests.
- A release workflow prepares a source/deployment ZIP without environment secrets or institution data.

**This is not yet a complete production ERP.** Finance, inventory and HR have initial APIs and basic list/create screens; journal posting, stock movement workflows, payroll processing screens and full domain acceptance remain incomplete. Library, PPDB, CMS, boarding, procurement, assets and CRM still need operational workflows. The PWA caches the static shell only. Hybrid sync has an authenticated pending-event inbox but no full domain processor/local outbox/conflict UI. Flutter mobile apps, Tauri desktop installer, kiosk mode and commercial Control Center are not production deliverables yet.

## Deployment modes

- **Neon Functions + GitHub Pages:** zero-additional-hosting-cost development path; see [Neon Functions and Pages deployment](docs/deployment/neon-functions-github-pages.md).
- **Cloud-connected container:** alternative container path using PostgreSQL/Neon and matching Neon Auth; see [container deployment](docs/deployment/container-cloud.md).
- **Local/offline:** not implemented; current authentication depends on Neon Managed Auth and therefore requires connectivity.
- **Hybrid:** foundation only; full event processing and conflict-resolution workflows are not complete.

## Quick start — web/API development

Requirements: Node.js 22+, pnpm 10.20.0, Docker Engine/Compose for the container path, PostgreSQL 18 for local migration tests.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @pondok-os/api build
pnpm --filter @pondok-os/api start
# In a second terminal:
pnpm --filter @pondok-os/web dev
```

Configure the API runtime with a restricted database role:

- `PONDOK_DATABASE_URL`: connection string for `pondok_app` (NOBYPASSRLS); this is the only database URL the API runtime should use.
- `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL`: from the same Neon branch.
- `CORS_ALLOWED_ORIGINS`: comma-separated exact browser origins.

Use `DATABASE_URL` only for the migration runner and controlled operator CLI. On Neon Functions, the automatically injected `DATABASE_URL` belongs to the managed owner role and is intentionally ignored by the API adapter.

For container deployment, copy `.env.compose.example` to `.env` and follow [docs/deployment/container-cloud.md](docs/deployment/container-cloud.md). For first institution initialization, follow [the first-install runbook](docs/runbooks/first-install.md).

## Database safety

- Neon development branch: `br-proud-paper-b312lfxi`.
- Neon production branch: `br-late-cherry-b3uqtuvh` — do not run development migrations here.
- The Neon development migration ledger currently contains versions 0001–0012. Migrations 0013 and 0014 are in the repository but have **not** been applied to Neon development.
- CI applies all migrations to a disposable PostgreSQL 18 service; CI success does not mean the Neon development or production branch was changed.
- Bootstrap and migration commands are explicit; they are not run automatically at application startup.

## Security boundaries

- The backend verifies JWTs and resolves membership/permissions from the selected organization.
- Authenticated tenant requests set `app.user_id` and `app.organization_id` transaction-locally before tenant queries, including the membership-resolution query.
- Migration 0013 enables and forces RLS on 60 organization-owned tables across 15 schema groups. It also protects `core.organizations`, `core.organization_memberships`, and `core.membership_roles` with dedicated policies.
- Migration 0014 creates/grants the restricted `pondok_app` role and transfers the membership predicate function to that NOBYPASSRLS role. The API runtime must use `PONDOK_DATABASE_URL`; Neon’s managed owner role has BYPASSRLS and must never be used by the API.
- Migrations 0013/0014 are **not yet active in Neon development**. Deploy the matching API build, provision the restricted role, then apply the migrations on development and verify live sign-in/bootstrap and two-tenant isolation.
- The app role cannot alter global RBAC dictionaries, membership role assignments, or the migration ledger. Initial owner assignment uses a narrowly scoped SECURITY DEFINER helper.
- These controls are not a completed security certification. The development database currently has no institution records; no real student/guardian/employee data should be imported before staging acceptance.
- Never commit database URLs, passwords, signing keys, bootstrap tokens, or personal data.

## Development

See [architecture blueprint](docs/architecture/blueprint.md), [implementation status](docs/architecture/implementation-status.md), [implementation roadmap](docs/roadmap/implementation.md), [production readiness gate](docs/runbooks/production-readiness.md), [first-install runbook](docs/runbooks/first-install.md), [backup/restore drill](docs/runbooks/backup-restore.md), [API runtime](apps/api/README.md), and [web workspace](apps/web/README.md).
