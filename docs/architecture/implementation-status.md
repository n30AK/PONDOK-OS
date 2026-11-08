# Implementation status

This file separates shipped code from roadmap intent. A green CI run proves automated checks against disposable PostgreSQL; it does not prove live institution acceptance.

## Verified Development snapshot (2026-11-08)

- Target: Neon project `frosty-cherry-92983148`, Development branch `br-proud-paper-b312lfxi`, database `neondb`.
- The live catalog contains 67 tables with `organization_id`; all 67 have RLS enabled and forced.
- The live migration ledger is recorded through 0023. Migrations 0024, 0025 and 0026 are present in the repository but are **not applied** to Development.
- Neon Function `pondokapi` Development deployment #42 is completed on Node.js 24. The preceding Development deployment workflow passed liveness and readiness checks. Readiness confirms database connectivity, not complete schema or business-workflow acceptance.
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
| Student master data | Student profile, structured address, guardian relationship, health profile and encrypted identity-document API foundations exist | Migrations 0026 pending; identity encryption key absent; complete document vault, guardian consent, lifecycle and live UAT pending |
| PPDB | Period/application lifecycle and metadata-only audit foundations exist | Secure document storage, checklist, selection/interview, guardian portal, registration/payment and UAT pending |
| Academic | Initial student/class/educator foundations exist | Curriculum configuration, scheduling, attendance correction, assessment, report cards, promotion and end-to-end workflows incomplete |
| Boarding / kesantrian | Initial dormitory, room, bed, assignment, leave and incident resources exist | Approval, safeguarding case handling, check-in/out, escalation and privacy acceptance incomplete |
| Finance/accounting | Chart of accounts, fiscal periods, journal draft/list, balanced-posting guard, period close and immutable posted journal foundations exist | Full posting UI, statements, budgets, cash/bank reconciliation and complete finance UAT pending |
| Inventory/procurement | Inventory item/warehouse/stock movement foundations exist; migration 0024 adds platform procurement/asset foundation | 0024 pending on Development; receiving/issue/transfer, stock opname, valuation and procurement workflow UI incomplete |
| HR/payroll | Employee, payroll period/run, approval/payment foundations exist; migration 0025 adds Central Command company HR/payroll/document metadata | 0025 pending on Development; attendance, leave, formula/tax validation, payslips and full processing UI incomplete |
| Guardian authority | Dedicated verification endpoint and migration 0026 are in repository; endpoint fails closed when schema is missing | Apply 0026 to Development only after explicit approval; verify permissions, audit and live workflow |
| Library | Catalog/copy/loan resources and issue/return foundation exist | Quota, renewal, overdue, policy and reporting workflows incomplete |
| CMS / announcements | Initial page and announcement workspaces exist | Editorial approval, publishing, version history and public rendering incomplete |
| CRM / alumni / donors | Initial contact, interaction and donor-pledge resources exist | Consent ledger, communication controls, accounting integration and full lifecycle incomplete |
| Sync / offline | Device registry, authenticated event inbox, idempotency and checkpoint foundations exist; PWA shell cache exists | Domain event processor, local outbox, conflict review and private offline data handling not implemented |
| Mobile / installer / kiosk | Not implemented as release-ready deliverables | Android/iOS apps, offline installer, local identity/database provisioning, wall kiosk and release signing |
| Live acceptance | Not completed | No tenant exists; two-tenant API isolation and role-based institution UAT have not been completed |

## Migration and security blockers

1. Development migration ledger stops at 0023. Migrations 0024–0026 must be reviewed, preflighted and applied in order to Development only after explicit authorization.
2. Before migration, reconcile all manually created schema objects against the migration ledger. Use the repository migration runner so advisory locking, per-migration transactions and SHA-256 checksum checks remain active.
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

PONDOK OS has a functioning Development deployment foundation and broad tenant RLS coverage. It is **not ready for live institutional operations**. Migrations 0024–0026, identity-key provisioning, real institution onboarding, two-tenant API acceptance and role-based end-to-end UAT remain outstanding.
