# Implementation status

This file separates shipped code from roadmap intent. A green CI run proves automated checks against disposable PostgreSQL; it does not prove live institution acceptance.

## Verified Development snapshot (2026-11-08)

- Target: Neon project `frosty-cherry-92983148`, Development branch `br-proud-paper-b312lfxi`, database `neondb`.
- The live catalog contains 67 tables with `organization_id`; all 67 have RLS enabled and forced.
- The live migration ledger is recorded through 0027. Migrations 0024–0026 were applied to Development on 2026-11-08; migration 0027 was applied on 2026-11-09 in one atomic transaction, with a transaction-scoped advisory lock and SHA-256 checksums recorded from the exact repository files.
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

PONDOK OS has a functioning Development deployment foundation, broad tenant RLS coverage and migration ledger through 0027. It is **not ready for live institutional operations**. Identity-key provisioning, real institution onboarding, two-tenant API acceptance and role-based end-to-end UAT remain outstanding.


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

- PR #147 merged as `5714030418083c43e3800ecfb88c065c6dfaf265`. CI #1301 and Neon Function bundle #229 passed. Added unit tests for `withTenantScope` and `loadTenantContext`, including cross-organization denial and transaction-local context cleanup. This improves automated API helper coverage but does not replace live API acceptance with two real users/organizations.

- PR #149 merged as `db446339cceb88ae0100fb0f6954b046c0e3615e`; CI #1312 and Neon Function bundle #231 passed. PPDB accepted-applicant conversion now creates a guardian contact and a normalized student–guardian relationship in the same transaction, with consent pending and legal/pickup authority false until verified.
- PR #150 merged as `2b5d0d9e4ae7d145db8861fba028f5df85dd6cc1`; CI #1320 and Neon Function bundle #234 passed. Central Command overview now uses a Super Admin-only, read-only aggregate metrics endpoint for customer, subscription, invoice, installation, support and backup status.
- Neither PR performed Neon Development/Production writes or schema changes. The metrics endpoint currently reports zero because the Development platform tables contain no commercial records; no live customer workflow has been proven.


- PR #152 merged as `8357efe3e9a550df04d355b73c2c51a8d7e258db`; CI #1327 and Neon Function bundle #236 passed. `GET /health/ready` now verifies both restricted runtime roles and live RLS coverage before returning ready. The Development runtime-role inspection returned 63/63 tenant tables and 79/79 platform tables covered, with both roles NOLOGIN/NOBYPASSRLS. Function deployment #52 is completed; direct HTTP health response remains unverified.
- Development Function environment metadata still does not list `STUDENT_IDENTITY_ENCRYPTION_KEY`; identity-document operations remain fail-closed pending approved key provisioning, recoverable backup and rotation/recovery.


- PR #154 merged as `719965913b65b2552b11e30bf2c8f79ae9d14251`; CI #1341 and Neon Function bundle #241 passed. Health and identity encryption keys now require canonical Base64 for exactly 32 bytes and valid version labels. Identity key is still absent in the Development Function environment; identity-document routes remain fail-closed. A provisioning/recovery runbook was added.
- PR #155 merged as `15988acabbae34c7f63ff5b6a9ef1eeba94bca5e`; CI #1343 and Neon Function bundle #242 passed. CI now starts the actual API HTTP server against disposable PostgreSQL, signs two synthetic EdDSA JWTs, and verifies own-tenant data access plus cross-tenant read/write denial.
- Development Function `pondokapi` deployment #53 is completed. Direct HTTP readiness response is not independently verified; real Neon Auth two-user/two-tenant UAT remains pending.


## Verified update after PR #157–#160 and Development inspection (2026-11-09)

- PR #157 merged the navigation grouping for institution/personnel master data. PR #158 merged default masking of student health fields in table/list/detail renderers. PR #159 merged API response filtering for guardian legal-authority and pickup-authority fields; ordinary student/guardian readers and editors no longer receive the five restricted authority fields unless they hold `academic.students.guardians.verify`. The user reported post-merge PONDOK OS CI #1369, Release Bundle #116 and Neon Function bundle #248 all succeeded for merge commit `4939e9ede4f1313abd4117d0814767c46350ccc6`.
- PR #160 merged the contextual navigation correction. `Resource.group` is now the source of truth for workspace page groups. Student master pages are separated from educator/organization and HR/payroll pages. The current main source was re-read and confirms the student group contains only student identity, restricted identity/health, guardian and student–guardian relation pages.
- A fresh read-only Neon Development inspection on 2026-11-09 reconfirmed 67 tables carrying `organization_id`, 145 application tables with RLS enabled and forced, and migration ledger through 0026. Earlier direct runtime-role verification remains 63/63 tenant tables and 79/79 platform tables covered by the restricted runtime roles and policies.
- The same read-only inspection found zero organizations, organization memberships, student profiles, HR employees, platform customers, subscriptions, module entitlements and module orders. No synthetic tenant or personal records were created.
- Development Function `pondokapi` deployment #59 is completed on Node.js 24. Its environment metadata lists the health encryption key/version and still does not list `STUDENT_IDENTITY_ENCRYPTION_KEY`; identity-document reads/writes remain fail-closed. The metadata also still lists the retired `PONDOK_BOOTSTRAP_TOKEN_SHA256` variable. Do not use it. Direct HTTP readiness and legacy-bootstrap responses have not yet been independently verified from the available inspection path.
- The live source has the legacy `POST /v1/bootstrap/organization` route returning HTTP 410. PR #161 is merged and removes the old token-based setup UI, direct database `db:bootstrap` command, unused legacy handler/test, token generator and digest injection from deployment configuration. It adds tests for activation redemption, user binding, replay denial, rollback, and a deployment-time HTTP 410 assertion. Development Function deployment #57 is completed; direct HTTP verification from the current inspection environment failed DNS resolution, so do not claim the route response is independently confirmed until the workflow result is inspected. The old digest name still appears in Function environment metadata but is no longer consumed by code.
- Legacy PR #40 was closed as superseded and explicitly not merged. Its `PONDOK_DATABASE_URL` / `pondok_app` / `pondok_rls_owner` architecture must not be reintroduced; current main uses transaction-scoped `pondok_runtime` and `pondok_platform_runtime`.
- PR #162 adds a source-backed Indonesian child-data and education regulatory readiness matrix; PR #164 records the urgent PP TUNAS reporting-deadline and PSE registration reviews.
- PR #165 is merged and migration 0027 is applied to Development. The commercial customer registry now has a `tenant_id` foreign key to `core.organizations` and a partial unique index enforcing one customer per tenant. Central Command CRM can create a linked customer or link an existing prospect through a Super Admin-only audited API. The Development customer table remains empty; no contract, subscription, invoice, installation or entitlement was created. Commercial release remains NO-GO. Real two-user/two-tenant Neon Auth acceptance, actual institution onboarding, identity-key lifecycle, backup/restore drill, role-based operational UAT, and end-to-end module and Central Command lifecycles remain outstanding.
