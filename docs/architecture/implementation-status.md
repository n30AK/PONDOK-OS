# Implementation status

This file separates shipped code from roadmap intent. A green CI run proves automated checks against disposable PostgreSQL; it does not prove live institution acceptance.

## Verified Development snapshot (2026-11-08)

- Target: Neon project `frosty-cherry-92983148`, Development branch `br-proud-paper-b312lfxi`, database `neondb`.
- The live catalog contains 67 tables with `organization_id`; all 67 have RLS enabled and forced.
- The live migration ledger is recorded through 0026. Migrations 0024–0026 were applied to Development on 2026-11-08 in one atomic transaction, with a transaction-scoped advisory lock and SHA-256 checksums recorded from the exact repository files.
- Neon Function `pondokapi` Development deployment #43 is completed on Node.js 24. The preceding Development deployment workflow passed liveness and readiness checks. Readiness confirms database connectivity, not complete schema or business-workflow acceptance.
- `STUDENT_HEALTH_ENCRYPTION_KEY` is configured. `STUDENT_IDENTITY_ENCRYPTION_KEY` is absent; the identity-document API must remain fail-closed until secure key provisioning, recoverable backup and rotation are prepared.
- There are currently zero organizations, memberships, student profiles and HR employees. No fabricated tenant or personal records have been seeded.
- PR #125 (Development live-audit documentation) was merged as `57b8f36`; its CI foundation job passed.
- Production branch `br-late-cherry-b3uqtuvh` has not been modified.

## Area-by-area status

| Area | Current state | Remaining acceptance / gaps |
|---|---|---|
| Monorepo and CI | Build/typecheck/tests and disposable PostgreSQL migration pipeline pass | Live tenant acceptance remains separate |
| Core tenant schema | Core organization, campus, membership, role, permission, settings and audit foundations exist | No real tenant exists; first institution requires actual details and authorized Super Admin activation |
| Tenant authorization | Live catalog reports 67/67 organization-owned tables with ENABLE + FORCE RLS | API-level two-tenant isolation with two independent real test identities remains pending |
| Central Command | Activation request, Super Admin approval and token-based first-tenant activation foundations exist | First real institution onboarding and complete company operations remain pending |
| Student master data | Student profile, structured address, guardian relationship, health profile and encrypted identity-document API foundations exist | Migration 0026 is applied; identity encryption key absent; complete document vault, guardian consent, lifecycle and live UAT pending |
| PPDB | Period/application lifecycle and metadata-only audit foundations exist | Secure document storage, checklist, selection/interview, guardian portal, registration/payment and UAT pending |
| Academic | Initial student/class/educator foundations exist | Curriculum configuration, scheduling, attendance correction, assessment, report cards, promotion and end-to-end workflows incomplete |
| Boarding / kesantrian | Initial dormitory, room, bed, assignment, leave and incident resources exist | Approval, safeguarding case handling, check-in/out, escalation and privacy acceptance incomplete |
| Finance/accounting | Chart of accounts, fiscal periods, journal draft/list, balanced-posting guard, period close and immutable posted journal foundations exist | Full posting UI, statements, budgets, cash/bank reconciliation and complete finance UAT pending |
| Inventory/procurement | Inventory item/warehouse/stock movement foundations exist; migration 0024 adds platform procurement/asset foundation | 0024 is applied on Development; receiving/issue/transfer, stock opname, valuation and procurement workflow UI incomplete |
| HR/payroll | Employee, payroll period/run, approval/payment foundations exist; migration 0025 adds Central Command company HR/payroll/document metadata | 0025 is applied on Development; attendance, leave, formula/tax validation, payslips and full processing UI incomplete |
| Guardian authority | Dedicated verification endpoint and migration 0026 are deployed in code and applied to Development; schema and permissions verified | Live authenticated guardian verification and audit workflow UAT pending |
| Library | Catalog/copy/loan resources and issue/return foundation exist | Quota, renewal, overdue, policy and reporting workflows incomplete |
| CMS / announcements | Initial page and announcement workspaces exist | Editorial approval, publishing, version history and public rendering incomplete |
| CRM / alumni / donors | Initial contact, interaction and donor-pledge resources exist | Consent ledger, communication controls, accounting integration and full lifecycle incomplete |
| Sync / offline | Device registry, authenticated event inbox, idempotency and checkpoint foundations exist; PWA shell cache exists | Domain event processor, local outbox, conflict review and private offline data handling not implemented |
| Mobile / installer / kiosk | Not implemented as release-ready deliverables | Android/iOS apps, offline installer, local identity/database provisioning, wall kiosk and release signing |
| Live acceptance | Not completed | No tenant exists; two-tenant API isolation and role-based institution UAT have not been completed |

## Migration and security blockers

1. Development migration ledger now records 0024–0026. Their exact repository-file SHA-256 checksums are recorded; the three changes were committed atomically under an advisory lock after preflight.
2. Future schema changes must use the repository migration runner and preserve checksum validation, locking and ordered application.
3. Do not apply any migration to Production. Never paste database URLs, API keys or encryption key material into chat, source control or logs.
4. Provision `STUDENT_IDENTITY_ENCRYPTION_KEY` only through an approved secret-management path. It must decode from base64 to exactly 32 bytes. Establish an encrypted recoverable backup and rotation/recovery procedure before enabling writes.
5. Verify API permissions and RLS using two independent tenant identities and organizations; catalog RLS checks alone are not sufficient.

## Completion criteria

A module is not operationally complete until it has:
1. Database schema and forward-only migration applied to the intended non-production environment.
2. Backend authorization for every read, write and state transition.
3. Role-appropriate UI with loading, error, empty and validation states.
4. Tenant scoping, RLS ENABLE + FORCE and cross-tenant denial tests.
5. Audit events for sensitive changes and restricted reads where required.
6. Unit, integration, authorization, regression and end-to-end tests.
7. Backup/restore, retention and operational runbook coverage appropriate to risk.
8. UAT evidence from a non-production institution tenant.
9. Accurate readiness status; a menu, CRUD form or successful health endpoint is not proof of a complete workflow.

## Release statement

PONDOK OS has a functioning Development deployment foundation, broad tenant RLS coverage and migration ledger through 0026. It is **not ready for live institutional operations**. Identity-key provisioning, real institution onboarding, two-tenant API acceptance and role-based end-to-end UAT remain outstanding.


## Live module-contract audit (2026-11-08)

- The workspace declares 44 module resources. The API exposes 42 generic tenant-scoped resources plus two dedicated handlers for encrypted student identity documents and encrypted student health profiles.
- All 45 distinct read/write permission keys referenced by the workspace resource declarations exist in `core.permissions` and are granted to both global institution-owner and institution-admin role templates on Development. Guardian-authority verification remains a separate permission and route.
- The Development catalog currently has one active company Super Administrator, but zero organizations, memberships, activation requests and activation tokens. The sample DEMO/PILOT institution has not been activated; tenant creation must use the authenticated Central Command approval/activation flow.
- The current Development `pondokapi` Function deployment is #43 (Node.js 24, completed). Its environment still does not contain `STUDENT_IDENTITY_ENCRYPTION_KEY`; identity-document operations must remain fail-closed.
- This contract audit confirms route/resource and permission wiring only. It does not prove authenticated browser workflows, data persistence under a tenant, two-tenant API isolation, or institution UAT.

## Verified changes after the 2026-11-08 snapshot (2026-11-09)

- PR #141 added filtered visible-row CSV export and browser print for supported module tables. CSV export remains disabled in preview mode and for restricted student identity/health resources. PDF/XLSX and institution-letterhead print are not yet implemented.
- PR #142 replaced raw relation-ID column headings with human-readable labels. This improves headings but does not, by itself, prove every relation value is resolved to a safe display label.
- PR #143 added visible loading and error states for relation pickers; lookup failures are no longer silently shown as empty choices.
- PR #144 fixed the student-options lookup permission allow-list for academic, boarding and library readers. It was merged as `10402d1094bde8bef753ece464dcd7b5a79fb5a7`. CI #1286 (including migrations on disposable PostgreSQL, RLS, typecheck, builds, container smoke test and unit tests) and Neon Function bundle #225 passed before merge.
- These changes did not apply migrations, seed records, write to Neon Development, or modify Neon Production.
- The PR #144 merge commit has been confirmed. Post-merge Pages and Release Bundle runs have not been confirmed in this audit; do not infer deployment from the PR CI result.

## Commercial readiness decision (2026-11-09)

PONDOK OS and Central Command remain **not ready for general commercial release**. See `docs/commercial/COMMERCIAL_READINESS_BASELINE_2026-11-09.md` for the gate matrix and prioritized acceptance work. Critical outstanding items include identity-key provisioning with recoverable backup/rotation, two-tenant/two-user API isolation, real institution onboarding, end-to-end student/guardian/PPDB and academic/boarding workflows, data-backed reports, and complete Central Command subscription/entitlement/billing/support operations.

A generic initial-record form or a green CI job is not a completed domain workflow. Pilot and commercial claims must be restricted to the exact modules and deployment modes that have passed UAT and operational acceptance.
- Direct read-only Development verification on 2026-11-09 reconfirmed 67/67 tenant-owned tables with RLS ENABLE + FORCE and 26 migration records. The same query found zero organizations, organization memberships, student profiles, HR employees, platform customers, module entitlements and module orders. `core.organization_memberships` itself has RLS ENABLE + FORCE with explicit platform-controlled insert and self/active-tenant or Super Admin read policies; live two-tenant API acceptance remains pending.


- PR #146 merged as `c5694cd24f36a34cf89e210bbeb2b7e7f1f55e15`. CI #1299 and Neon Function bundle #227 passed before merge. The change adds a Super Admin-only, read-only registry for module entitlements, module orders and redacted lifecycle events, and separates it from the module-request approval queue. It does not enable entitlement mutations or complete commercial provisioning. No database writes or migrations were performed.
