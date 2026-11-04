# Implementation status

This file separates shipped code from roadmap intent. "CI passed" means the repository's automated pipeline passed on its disposable PostgreSQL 18 service; it does not mean a live institution deployment has passed acceptance.

## Verified Development snapshot (2026-11-05)

- Migrations 0017 and 0018 are applied and recorded in the Development migration ledger; Production was not modified.
- The seven Module Registry/master-data tables are present. The four new tenant-owned tables have ENABLE + FORCE RLS and tenant policies.
- The six new health/educator/organization permissions exist; owner/admin role templates include all six.
- One verified, unbanned Super Administrator is active; the `institution_owner` system role is present.
- Neon Function `pondokapi` Development deployment #23 completed with `STUDENT_HEALTH_ENCRYPTION_KEY` and `STUDENT_HEALTH_ENCRYPTION_KEY_VERSION` configured.
- No organization, campus, membership, or real student/employee data exists yet. The first institution must be created with its actual details through Central Command before tenant-scoped modules can be exercised.
- These are infrastructure and schema checks, not live end-to-end acceptance or production certification.

| Area | Current state | Evidence / remaining work |
|---|---|---|
| Monorepo and CI | Implemented foundation | pnpm/Turbo workspace; migration runner with checksums/advisory locking; disposable PostgreSQL migration integration; workspace build/typecheck/tests and Docker image builds |
| Core tenant schema | Foundation implemented | organizations, campuses, memberships, roles, permissions, settings and audit event table |
| Identity and onboarding | Initial implementation; first-tenant gate ready | Neon Managed Auth EdDSA JWT verification; centralized activation workflow; Development Super Admin verified; one-time first-tenant bootstrap form and endpoint are deployed. Actual tenant creation awaits the institution's real name, slug and campus details. |
| Tenant authorization | Development database activation complete; live acceptance partial | Migrations 0013 and 0014 are applied on Neon Development. 59 organization-owned tables across 15 schema groups enforce RLS; `pondok_runtime` is NOLOGIN/NOBYPASSRLS and API tenant transactions switch to it before queries. `core.membership_roles` and `core.role_permissions` also enforce RLS. CI and staging tests cover fail-closed context, cross-tenant read/write denial and bootstrap writes. Live two-identity/two-organization API acceptance and campus-level authorization remain incomplete; `core.organization_memberships` remains the membership authority excluded from RLS. |
| Academic/student | Partial operational API/UI | Master student profile, structured addresses, guardian records/relationships, health profile and identity-document schema/API foundations are present. Health data uses AES-256-GCM and restricted permissions. Full document vault, guardian consent workflow, academic scheduling/grading, and end-to-end acceptance remain incomplete. |
| Finance/accounting | Partial operational UI/API | chart of accounts, fiscal periods, journal draft creation/listing, balanced posting guard, period close and immutable posted journal records; basic account/period list and create screens; journal posting, full statements, budgeting and cash/bank reconciliation UI pending |
| Inventory | Partial operational UI/API | item, warehouse and append-only stock movement endpoints; basic item/warehouse list and create screens; receiving/issue/transfer UI, stock opname, valuation and procurement integration pending |
| HR/payroll | Partial operational UI/API | employee, payroll period/run, approval and payment endpoints with immutable approved payroll; basic employee/payroll-period list and create screens; attendance, leave, payroll formulas/tax rules, payslips and payroll processing UI pending |
| Library | Initial operational workflow | catalog/copy/loan resources have forms and list views; issue/return endpoints update copy availability and write audit events. Quota, renewal, overdue and full policy workflows remain incomplete. |
| PPDB/admissions | Partial UI/API | admissions workspace and period/application/document/review foundations exist; secure private document storage, complete selection/registration workflows and acceptance remain pending. |
| CMS | Initial CRUD workspace | page and announcement resources have contextual forms/list views; editorial approval, publishing, version history and public rendering workflows remain pending. |
| Boarding | Initial CRUD workspace | dormitory, room, bed, assignment, leave and incident resources have forms/list views; approval, safeguarding case management, check-in/out and escalation workflows remain pending. |
| Procurement/assets/CRM | Initial CRUD workspace | supplier, requisition, purchase order, asset, contact, interaction and donor pledge resources have contextual forms/list views; approval chains, accounting integration, consent ledger and full lifecycle workflows remain pending. |
| Sync | Partial foundation | device registry, authenticated event inbox, idempotency and checkpoints; domain event processor, local outbox and conflict review UI pending |
| Web workspace | Multi-resource workspace deployed to main | Neon Auth sign-in, tenant selector, Central Command first-tenant form, master-data and module workspaces, contextual forms, list/create/correction screens, and finance/inventory/HR operations. A menu or generic CRUD form is not evidence that a full business workflow is complete. |
| PWA offline | Shell only | static shell cache; no private data cache or offline mutation queue |
| Cloud-connected containers | Build-verified | Docker API/web targets and Compose; requires external PostgreSQL, Neon Auth and TLS reverse proxy |
| Local/offline installer | Not implemented | local identity provider, local DB provisioning, LAN acceptance and backup automation required |
| Flutter mobile | Not implemented | Android/iOS clients and release signing required |
| Tauri desktop | Not implemented | installer, local services and auto-update required |
| Kiosk | Not implemented | kiosk UX, device registration and hardened browser policy required |
| Commercial Control Center | Not implemented | separate provider plane, billing, license issuance and support CRM required |
| Live acceptance | Not completed | Development API Function deployment #23 is completed and the database schema/security checks pass. No first tenant exists, so tenant-scoped end-to-end workflows, two-tenant API isolation and real institution UAT have not been completed. First-tenant bootstrap is available to the verified Super Administrator through Central Command and requires actual institution details. |

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
