# PONDOK OS

Integrated Islamic Boarding School Operating System.

PONDOK OS is designed as a configurable, offline-first and cloud-capable platform for pesantren and modern Islamic boarding schools. It combines academic management, student affairs, boarding operations, ERP, CRM, HR & payroll, accounting, inventory, library, CMS, admissions, mobile experiences, smart kiosks, and a separate commercial Control Center.

## Product principles

- **Offline-first:** core campus operations continue on a local network without internet access.
- **Cloud and hybrid capable:** controlled synchronization connects local installations with cloud services.
- **Configurable:** organization structures, academic models, forms, workflows, reports, and enabled modules are configurable per institution.
- **Tenant isolation:** each organization’s data is isolated and access is enforced by the backend.
- **Auditable:** important business and academic changes are traceable.
- **Open standards:** PostgreSQL, REST/OpenAPI, and documented export formats reduce vendor lock-in.
- **Cost-conscious:** local deployment is a first-class option; cloud services are optional and designed around free-tier constraints where practical.

## Deployment modes

1. **Local:** application and PostgreSQL run on infrastructure operated by the institution.
2. **Cloud:** centrally hosted application and database.
3. **Hybrid:** local operations with controlled synchronization to cloud services.

## Product areas

- Core identity, organizations, campuses, roles, permissions, and configuration
- Academic, curriculum, assessment, attendance, and report cards
- Student records, guardians, boarding, dormitories, and student activities
- Finance, accounting, budgeting, procurement, inventory, and fixed assets
- HR, attendance, leave, and payroll
- Library, digital learning, health, canteen, transportation, alumni, and donors
- CMS, public websites, SEO, and PPDB admissions
- Parent, student, and staff applications
- Smart campus kiosks and operational dashboards
- Separate PONDOK OS Control Center for customers, licenses, subscriptions, releases, billing, partners, and support

## Architecture status

This repository is being initialized. The product blueprint is not a claim that these modules are already implemented. Each capability will be marked complete only after implementation and verification.

See [docs/architecture/blueprint.md](docs/architecture/blueprint.md) and [docs/roadmap/implementation.md](docs/roadmap/implementation.md).

## Technology direction

The initial implementation uses TypeScript, a modular monolith backend, PostgreSQL, a web frontend, Flutter for mobile, and Tauri for desktop packaging. Exact framework versions and package choices are recorded in the implementation manifests as they are introduced.

## Development

Development is performed on feature branches. Database migrations are versioned and tested against a non-production Neon branch before any production rollout.

Never commit credentials, database URLs, private signing keys, personal student data, or production exports.
