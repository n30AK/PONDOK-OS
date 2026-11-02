# PONDOK OS

Integrated operating system for pesantren and Islamic boarding schools.

PONDOK OS is being developed as a configurable modular platform for academic management, student affairs, boarding, finance, accounting, inventory, procurement, assets, HR/payroll, library, PPDB, CMS, CRM, and institution operations. The commercial Control Center is designed as a separate security plane from institution-owned records.

## Current implementation snapshot

The repository currently contains:

- TypeScript monorepo foundation and PostgreSQL migration runner with checksums and advisory locking.
- Neon Managed Auth JWT verification and server-side organization membership/permission resolution.
- Guarded first-institution setup flow using a one-time server-side SHA-256 token.
- Tenant-scoped API foundations for student records, finance journals, inventory items/warehouses/stock movements, HR employees and payroll transitions.
- Indonesian React/Vite admin workspace with Neon Auth sign-in, first setup, tenant selection, student list/create, and initial finance/inventory/HR list + basic-record creation screens.
- PostgreSQL domain foundations for library, PPDB, CMS, boarding, procurement, fixed assets, CRM and hybrid sync.
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
- Development migration ledger contains versions 0001–0012.
- CI migrations use a disposable PostgreSQL 18 service; CI success does not mean the production branch was changed.
- Bootstrap and migration commands are explicit; they are not run automatically at application startup.

## Security boundaries

- The backend verifies JWTs and resolves membership/permissions from the selected organization.
- The UI never supplies trusted role or permission claims.
- Tenant-owned records carry organization scope and composite foreign keys where applicable.
- Global PostgreSQL RLS is not enabled. Treat tenant isolation as application-enforced, not as a completed database security certification.
- The development database currently has no institution records; no real student/guardian/employee data should be imported before staging acceptance.
- Never commit database URLs, passwords, signing keys, bootstrap tokens, or personal data.

## Development

See [architecture blueprint](docs/architecture/blueprint.md), [implementation status](docs/architecture/implementation-status.md), [implementation roadmap](docs/roadmap/implementation.md), [production readiness gate](docs/runbooks/production-readiness.md), [first-install runbook](docs/runbooks/first-install.md), [backup/restore drill](docs/runbooks/backup-restore.md), [API runtime](apps/api/README.md), and [web workspace](apps/web/README.md).
