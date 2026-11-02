# Implementation Roadmap

## Sprint 0 — Foundation
- Monorepo and CI
- TypeScript conventions
- Database migration baseline
- Core organization/campus model
- Tenant-scoped identity and RBAC foundation
- Audit events
- Configuration metadata foundation
- Development and deployment documentation

Acceptance: clean install and build; migrations apply on an empty development database; tenant boundary tests pass; role/permission tests pass; no secrets or real personal data in fixtures.

## Sprint 1 — Academic and student operations
- Academic year, term, grade, class, subject, curriculum
- Student and guardian records
- Enrollment and class placement
- Attendance, assessment, report cards
- Diniyah and tahfidz assessment profiles
- Boarding, dormitory, permissions, activities

## Sprint 2 — Finance, accounting, inventory, library
- Fees, invoices, receipts, cash/bank
- Chart of accounts, journals, ledger, closing
- Budgeting and financial reports
- Warehouse, item catalog, stock ledger, stock count
- Procurement and vendor workflows
- Library catalog, circulation, fines, digital resources

## Sprint 3 — HR and supporting operations
- Employee records, contracts, attendance, leave
- Payroll with configurable components
- Fixed assets, maintenance, canteen/POS, transport, health
- Donors and alumni

## Sprint 4 — CMS and PPDB
- Multi-site CMS, page builder, media, SEO
- Admission landing pages and applicant portal
- Application, document review, selection, re-registration
- Static website export

## Sprint 5 — Offline and hybrid
- Local packaging and PostgreSQL provisioning
- Outbox/inbox sync
- Device registry and checkpoints
- Conflict review, retry, observability
- Backup and restore

## Sprint 6 — Mobile and smart campus
- Parent, student, staff Flutter apps
- Kiosk / touchscreen web mode
- QR/NFC integration and notifications

## Sprint 7 — Commercial Control Center
- Customer CRM, tenant registry
- License signing and verification
- Perpetual/subscription entitlements
- Billing, releases, installations, support, partners
- Local Control Center mode

## Sprint 8 — AI and ecosystem
- Permission-aware AI assistant
- Academic/tahfidz support
- Management analytics
- Integrations and marketplace

Every sprint has to pass build, migration, security, and domain-specific acceptance tests before being marked complete.
