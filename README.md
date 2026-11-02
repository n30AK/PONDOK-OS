# PONDOK OS

Integrated operating system for pesantren and Islamic boarding schools.

PONDOK OS is being developed as a configurable modular platform for academic management, student affairs, boarding, finance, accounting, inventory, procurement, assets, HR/payroll, library, PPDB, CMS, CRM, and institution operations. The commercial Control Center is designed as a separate security plane from institution-owned records.

## Current implementation snapshot

The repository now contains:

- TypeScript monorepo foundation and PostgreSQL migration runner with checksums and advisory locking.
- Neon Managed Auth JWT verification and server-side organization membership/permission resolution.
- Tenant-scoped student listing and creation API.
- Initial React/Vite Indonesian admin workspace with Neon Auth sign-in and student list/create UI.
- PostgreSQL domain foundations for finance/accounting, inventory, HR/payroll, library, PPDB, CMS, boarding, procurement, fixed assets, CRM, and sync inbox.
- Global system role templates and guarded first-organization bootstrap CLI.
- PWA shell caching, Docker images, Nginx reverse proxy and Compose deployment for cloud-connected mode.
- CI executes migrations on disposable PostgreSQL 18, typechecks, builds workspaces and containers, and runs unit tests.

**This is not yet a complete production ERP.** Most business modules currently have database foundations but not full workflows, screens, reporting, audit coverage, or end-to-end acceptance tests. The PWA caches the static shell only. Hybrid sync accepts pending events but has no domain processor or full offline outbox. Flutter mobile apps, Tauri desktop installer, kiosk mode and the commercial Control Center are not production deliverables yet.

## Deployment modes

- **Cloud-connected container:** available as an initial deployment path using an external PostgreSQL/Neon database and matching Neon Auth branch. See [container deployment](docs/deployment/container-cloud.md).
- **Local/offline:** planned; local identity, local database installer, LAN acceptance tests and offline outbox are not complete.
- **Hybrid:** foundation only; full event processing and conflict-resolution workflows are not complete.

## Quick start — web/API development

Requirements: Node.js 22+, pnpm 10.20.0, PostgreSQL 18 for local migration tests.

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

For container deployment, copy `.env.compose.example` to `.env` and follow [docs/deployment/container-cloud.md](docs/deployment/container-cloud.md).

## Database safety

- Neon development branch: `br-proud-paper-b312lfxi`.
- Neon production branch: `br-late-cherry-b3uqtuvh` — do not run migrations here during development.
- Existing manually applied migrations 0001–0003 must be reconciled with `core.schema_migrations` before the standard migration runner is used on that development database.
- CI migrations use a disposable PostgreSQL 18 service; CI success does not mean the live Neon branch was changed.
- Bootstrap and migration commands are explicit; they are not run automatically at application startup.

## Security boundaries

- The backend verifies JWTs and resolves membership/permissions from the selected organization.
- The UI never supplies trusted role or permission claims.
- Tenant-owned records carry organization scope and composite foreign keys where applicable.
- RLS is not yet enabled for all tenant schemas; do not treat current tenant protection as a completed security certification.
- Never commit database URLs, passwords, signing keys, or student/guardian production data.

## Development

See [architecture blueprint](docs/architecture/blueprint.md), [implementation status](docs/architecture/implementation-status.md), [implementation roadmap](docs/roadmap/implementation.md), [production readiness gate](docs/runbooks/production-readiness.md), [backup/restore drill](docs/runbooks/backup-restore.md), [API runtime](apps/api/README.md), and [web workspace](apps/web/README.md).
