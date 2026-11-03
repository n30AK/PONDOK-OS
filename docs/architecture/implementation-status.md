# Implementation status

This file separates shipped code from roadmap intent. "CI passed" means the repository's automated pipeline passed on its disposable PostgreSQL 18 service; it does not mean a live institution deployment has passed acceptance.

| Area | Current state | Evidence / remaining work |
|---|---|---|
| Monorepo and CI | Implemented foundation | pnpm/Turbo workspace; migration runner with checksums/advisory locking; disposable PostgreSQL migration integration; workspace build/typecheck/tests and Docker image builds |
| Core tenant schema | Foundation implemented | organizations, campuses, memberships, roles, permissions, settings and audit event table |
| Identity and onboarding | Initial implementation | Neon Managed Auth EdDSA JWT verification; guarded first-organization bootstrap with one-time SHA-256 token, advisory lock, owner assignment and audit event; live sign-in/first-setup acceptance still pending |
| Tenant authorization | Code and CI hardening implemented; live database activation pending | API verifies active membership and resolves permissions server-side; authenticated tenant requests set transaction-local context before membership lookup; migration 0013 applies FORCE RLS to 60 organization-owned tables across 15 schema groups and dedicated RLS to organizations/membership-role authority; migration 0014 provisions least-privilege `pondok_app` with NOBYPASSRLS/NOINHERIT and transfers the membership predicate to that role; CI tests restricted-role fail-closed behavior, authority-table isolation, bidirectional tenant isolation, cross-tenant writes and first bootstrap; migrations 0013/0014 are not yet applied to Neon development |
| Academic/student | Partial operational API | student list/create API and PWA student list/create screens; academic years, terms, programs, classes, subjects, enrollments, guardians and attendance tables exist; remaining academic workflows and screens are incomplete |
| Finance/accounting | Partial operational UI/API | chart of accounts, fiscal periods, journal draft creation/listing, balanced posting guard, period close and immutable posted journal records; basic account/period list and create screens; journal posting, full statements, budgeting and cash/bank reconciliation UI pending |
| Inventory | Partial operational UI/API | item, warehouse and append-only stock movement endpoints; basic item/warehouse list and create screens; receiving/issue/transfer UI, stock opname, valuation and procurement integration pending |
| HR/payroll | Partial operational UI/API | employee, payroll period/run, approval and payment endpoints with immutable approved payroll; basic employee/payroll-period list and create screens; attendance, leave, payroll formulas/tax rules, payslips and payroll processing UI pending |
| Library | Schema foundation | catalog, copies and loan tables; circulation API/UI pending |
| PPDB/admissions | Schema foundation | periods, applications, document metadata and review history; secure object storage and admissions workflows pending |
| CMS | Schema foundation | pages and announcements; authoring/publishing UI pending |
| Boarding | Schema foundation | dormitory, room, bed, assignments, leave and incident tables; workflows/UI pending |
| Procurement/assets/CRM | Schema foundation | supplier, requisition, purchase order, asset, contact, interaction and donor pledge tables; operational workflows/UI pending |
| Sync | Partial foundation | device registry, authenticated event inbox, idempotency and checkpoints; domain event processor, local outbox and conflict review UI pending |
| Web workspace | Initial implementation | Neon Auth sign-in, guarded first setup, tenant selector, dashboard, student list/create and basic finance/inventory/HR list/create screens; other module screens pending |
| PWA offline | Shell only | static shell cache; no private data cache or offline mutation queue |
| Cloud-connected containers | Build-verified | Docker API/web targets and Compose; API requires restricted `PONDOK_DATABASE_URL`; migration/CLI admin operations use separate `DATABASE_URL` |
| Neon Functions + GitHub Pages | Code/deployment workflow prepared | Node.js 24 fetch adapter and function ZIP CI artifact; manual dev deployment workflow; one-time GitHub Pages enablement and Neon API key setup remain external actions |
| Local/offline installer | Not implemented | local identity provider, local DB provisioning, LAN acceptance and backup automation required |
| Flutter mobile | Not implemented | Android/iOS clients and release signing required |
| Tauri desktop | Not implemented | installer, local services and auto-update required |
| Kiosk | Not implemented | kiosk UX, device registration and hardened browser policy required |
| Commercial Control Center | Not implemented | separate provider plane, billing, license issuance and support CRM required |
| Live acceptance | Not completed | no verified live first-owner setup/sign-in, two-tenant isolation test, or real institution workflow acceptance |

## Completion criteria

A module is not production-ready until it has:
1. Database schema and forward-only migration.
2. Backend authorization on every read/write operation.
3. UI for the intended user roles.
4. Audit events for sensitive changes.
5. Validation and error handling.
6. Automated unit, integration and end-to-end tests.
7. Backup/restore and operational runbook coverage where relevant.
8. Acceptance evidence from a non-production institution tenant.
