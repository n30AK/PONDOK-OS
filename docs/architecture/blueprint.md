# PONDOK OS — Technical Architecture Blueprint

## Product boundary

PONDOK OS has two separately secured planes:

- **Pondok Operational Plane:** institution-owned academic, student, boarding, finance, accounting, inventory, library, HR, CMS, admissions, and supporting operational data.
- **Commercial Control Plane:** PONDOK OS provider's customer CRM, tenant registry, licensing, subscription, billing, releases, installations, partner, and support operations.

Provider staff do not receive implicit access to operational student or financial records.

## Architecture

Start with a modular monolith and domain boundaries. Do not introduce microservices until independently deployable scaling or reliability needs are demonstrated.

### Implemented foundation (verified in repository)
- Web: React + TypeScript + Vite PWA workspace.
- API: Node.js 22 HTTP server with TypeScript, REST endpoints, Neon Managed Auth JWT verification and PostgreSQL access via `pg`.
- Data: PostgreSQL 18 migrations, checksum ledger and advisory-lock migration runner.
- Deployment: Docker API image, Nginx web image and Docker Compose for cloud-connected mode.
- CI: GitHub Actions with disposable PostgreSQL 18; migrations, typecheck, workspace builds, container builds and Node tests.

### Target architecture (not yet implemented)
- A larger modular API framework may be introduced if the codebase demonstrates a need; the current API is not NestJS.
- Prisma is a future option; the current persistence layer uses reviewed SQL and `pg`.
- Mobile: Flutter Android/iOS apps.
- Desktop packaging: Tauri with managed local API/database services.
- Offline/hybrid: local-first transactional outbox, device identity, domain processors and human conflict workflows.

## Deployment modes

### Local
A campus runs the API and PostgreSQL on a local server. Web clients, kiosk devices, and mobile clients on the campus LAN use the local endpoint. Core workflows must not require internet access.

### Cloud
A hosted API and PostgreSQL support remote parent access, multiple campuses, and centralized operations.

### Hybrid
Local transactions are committed first. An outbox worker delivers immutable, idempotent events to a cloud sync endpoint. The cloud validates tenant, device, schema version, and authorization before accepting events. Downstream changes are delivered through an inbox/checkpoint protocol.

## Domain boundaries

Core, identity, academic, student, boarding, finance, accounting, inventory, procurement, assets, library, HR, payroll, CRM, admission, LMS, health, canteen, transportation, donors, alumni, CMS, workflow, sync, audit, and analytics.

Each domain owns its services and persistence interfaces. Cross-domain writes use application services and domain events, not ad-hoc table updates.

## Tenant isolation and authorization

- organization_id is mandatory on tenant-owned records.
- Backend authorization is authoritative; UI hiding is not security.
- Use tenant-scoped query services and PostgreSQL RLS where compatible with the connection model.
- Keep provider Control Plane storage logically and access-control separated from operational data.
- Audit privileged actions and sensitive record access.
- Do not store production student or health data in fixtures.

## Offline consistency

- Local transaction and outbox event are committed atomically.
- Every event has a globally unique ID and idempotency key.
- Consumers are idempotent.
- Accounting journals are append-only after posting.
- Inventory balances are derived from stock ledger movements.
- Conflicts requiring human judgment enter a review queue; last-write-wins is not a universal policy.
- Sync status and failed-event diagnostics are visible to local administrators.

## Accounting and inventory invariants

- Posted journal entries balance (debits equal credits).
- Posted journals are not edited in place; corrections use reversals/adjustments.
- Financial periods can be closed.
- Inventory movements are ledger records; balances are not overwritten directly.
- Stock opname produces auditable adjustment movements.
- Cost valuation method is explicit and configurable per organization.

## Customization

Provide organization builder, academic model builder, custom form metadata, workflow builder, report templates, module entitlements, and importable institution templates. Configuration is versioned and changes are audited. Templates never copy another institution's personal data.

## Data protection

Use least privilege, encryption in transit, secure secret management, backup/restore drills, retention policies, and access logging. Student, guardian, health, and financial data require stricter authorization and retention controls.

## Current implementation status

This document defines intended architecture. A documented design is not evidence of implementation. Features become complete only after code, migration, automated tests, and a documented verification result exist.
