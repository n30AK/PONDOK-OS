# PONDOK OS

Integrated operating system for pesantren and Islamic boarding schools.

PONDOK OS is being developed as a configurable modular platform for academic management, student affairs, boarding, finance, accounting, inventory, procurement, assets, HR/payroll, library, PPDB, CMS, CRM, and institution operations. The commercial Control Center is designed as a separate security plane from institution-owned records.

## Product boundary and client support

- **PONDOK OS** is the institution-facing workspace for pesantren operations. It does not expose navigation, links, or platform-registry screens for the company Super Administrator.
- **Super Admin Command Center** is a separately built and routed application for company operators, including institution registry, approvals, module publishing, and platform audit. It is not linked from the institution workspace.
- The institution app can display an official WhatsApp Business support link on login and inside the workspace when `VITE_SUPPORT_WHATSAPP_NUMBER` is configured. Set the GitHub Actions repository variable `PONDOK_SUPPORT_WHATSAPP_NUMBER` to the company number in international digits only (for example, `62812...`, without `+`, spaces, or punctuation). The value is a public contact number, not a credential. If it is unset or invalid, no broken WhatsApp link is rendered.

## Current implementation snapshot

The repository currently contains:

- TypeScript monorepo foundation and PostgreSQL migration runner with checksums and advisory locking.
- Neon Managed Auth JWT verification and server-side organization membership/permission resolution.
- Guarded first-institution setup flow using a one-time server-side SHA-256 token.
- Transaction-scoped tenant context for authenticated API requests.
- Tenant isolation migration using FORCE ROW LEVEL SECURITY for 59 organization-owned tables across 15 schema groups.
- CI integration tests for fail-closed tenant context, cross-tenant read/write isolation, and the first-institution bootstrap sequence under RLS.
- Tenant-scoped API foundations for student records, finance journals, inventory items/warehouses/stock movements, HR employees and payroll transitions.
- Indonesian React/Vite admin workspace with Neon Auth sign-in, first setup, tenant selection, student list/create, and initial finance/inventory/HR list + basic-record creation screens.
- PostgreSQL domain foundations for library, PPDB, CMS, boarding, procurement, fixed assets, CRM and hybrid sync.
- Integrated master data is active on Neon Development (migration 0018): structured student identity/address fields with dedicated address inputs in the web forms, guardian contact and legal-authority relations, educator profiles, temporal employee assignments, hierarchical departments/positions, and a separately encrypted student-health store. The Development API Function has its AES-256-GCM health key configured; real health-data acceptance and key recovery/rotation drills remain pending.
- Global system role templates and bootstrap workflows.
- PWA shell caching, Docker images, Nginx reverse proxy and Compose deployment for cloud-connected mode.
- CI executes migrations on disposable PostgreSQL 18, typechecks, builds workspaces and containers, and runs unit tests.
- A release workflow prepares a source/deployment ZIP without environment secrets or institution data.

**This is not yet a complete production ERP.** Finance, inventory and HR have initial APIs and basic list/create screens; journal posting, stock movement workflows, payroll processing screens and full domain acceptance remain incomplete. Library, PPDB, CMS, boarding, procurement, assets and CRM still need operational workflows. The PWA caches the static shell only. Hybrid sync has an authenticated pending-event inbox but no full domain processor/local outbox/conflict UI. Flutter mobile apps, Tauri desktop installer, kiosk mode and commercial Control Center are not production deliverables yet.

## Deployment modes

- **Cloud-connected container:** initial deployment path using an external PostgreSQL/Neon database and matching Neon Auth. See [container deployment](docs/deployment/container-cloud.md).
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

Configure API environment variables for the same development branch:

- `DATABASE_URL`
- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_JWKS_URL`
- `CORS_ALLOWED_ORIGINS` (for deployed web origins)

For container deployment, copy `.env.compose.example` to `.env` and follow [docs/deployment/container-cloud.md](docs/deployment/container-cloud.md). For first institution initialization, follow [the first-install runbook](docs/runbooks/first-install.md).

## Database safety

- Neon development branch: `br-proud-paper-b312lfxi`.
- Neon production branch: `br-late-cherry-b3uqtuvh` — do not run development migrations here.
- The Neon Development migration ledger includes migrations 0013–0019. Migration 0013 forces tenant RLS on 59 organization-owned tables across 15 schema groups; migration 0014 creates the `pondok_runtime` NOLOGIN/NOBYPASSRLS role; migrations 0017–0018 add the module registry and integrated master data; migration 0019 protects the membership authority table.
- CI applies all migrations to disposable PostgreSQL 18; migrations 0013–0019 have also been explicitly applied and verified on Neon Development. Production remains untouched.
- Bootstrap and migration commands are explicit; they are not run automatically at application startup.

## Security boundaries

- The backend verifies JWTs and resolves membership/permissions from the selected organization.
- Authenticated tenant requests set `app.user_id` and `app.organization_id` transaction-locally before tenant queries.
- Migration 0013 enables and forces RLS on 59 organization-owned tables across 15 schema groups. Its integration test verifies missing-context denial, bidirectional tenant isolation, and cross-tenant write rejection.
- Migrations 0013–0019 are recorded on Neon Development. All organization-owned tables with an `organization_id` column now have ENABLE + FORCE RLS, including the membership authority table hardened by migration 0019. API tenant transactions switch to `pondok_runtime` before tenant queries so the `neondb_owner` connection cannot bypass RLS. The Development `pondokapi` Function deployment #25 is completed and includes the health-encryption key/version secrets. Live two-tenant API acceptance remains pending.
- Migration 0018 is applied only to Neon Development; Production remains untouched. One verified Development Super Administrator is active and the owner role template is ready. No organization or membership exists yet. The first-tenant form is available in Central Command and requires the actual institution and main-campus details before it can create the first workspace.
- `core.organization_memberships` now has ENABLE + FORCE RLS with tenant self-read, platform self/admin read, and controlled insert policies. Applicant membership creation requires a consumed activation token bound to the target organization.
- These controls are not a completed security certification. The development database currently has no institution records; no real student/guardian/employee data should be imported before staging acceptance.
- Never commit database URLs, passwords, signing keys, bootstrap tokens, or personal data.

## Development

See [student data protection and health encryption](docs/security/student-data-protection.md), [architecture blueprint](docs/architecture/blueprint.md), [implementation status](docs/architecture/implementation-status.md), [implementation roadmap](docs/roadmap/implementation.md), [production readiness gate](docs/runbooks/production-readiness.md), [first-install runbook](docs/runbooks/first-install.md), [backup/restore drill](docs/runbooks/backup-restore.md), [API runtime](apps/api/README.md), and [web workspace](apps/web/README.md).
