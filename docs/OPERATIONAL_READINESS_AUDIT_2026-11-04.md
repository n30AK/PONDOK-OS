# PONDOK OS — Operational Readiness Audit
**Audit date:** 2026-11-04  
**Repository baseline:** `770f4cca90031432f0331098faee56569cb24ba5` (PR #62 merge)  
**Environment inspected:** Neon Development only — project `frosty-cherry-92983148`, branch `br-proud-paper-b312lfxi`  
**Production:** not inspected for writes and not modified.

## Executive finding

PONDOK OS is a working technical foundation, not yet an institution-ready operating system. The repository has 39 generic module resources and all 39 have matching API resource definitions and matching read/write permission keys. This is useful structural parity, but it does not mean every domain has a complete lifecycle. Most generic resources currently provide list/create and limited correction; several high-impact workflows still need domain-specific transitions, approvals, reconciliation, reports, and end-to-end acceptance.

Central Command migration 0016 has now been applied to Development and recorded in the migration ledger. The platform tables and policies exist. The active Neon Function deployment is #16 (Node.js 24). Central Command cannot yet pass live approval/redeem UAT because no company Super Admin has been provisioned; the only currently registered Auth user is not email-verified. Do not grant Super Admin until the intended account is verified and explicitly confirmed.

## Verified facts

- Migration 0016 created `platform.super_admins`, `platform.activation_requests`, `platform.activation_tokens`, `platform.tenant_licenses`, and `platform.audit_events`.
- Four platform data tables have RLS enabled and forced. `platform.super_admins` is intentionally not granted to the restricted platform runtime role; privileged membership checks happen before switching roles.
- `pondok_platform_runtime` is `NOLOGIN` and `NOBYPASSRLS`.
- Migration ledger records 0015 and 0016 with SHA-256 checksums.
- Development currently has zero organizations, memberships, activation requests, and Super Admin records.
- The API implementation disables legacy `/v1/bootstrap/organization` with HTTP 410. The old `PONDOK_BOOTSTRAP_TOKEN_SHA256` Function environment key remains and must not be removed until the deployed endpoint is tested directly.
- The platform API unit tests cover request validation, denial of normal users from admin endpoints, applicant request creation, approval token entropy/hash storage, and legacy bootstrap shutdown. They do not yet cover a complete live redemption, replay/expiry, or database-backed activation lifecycle.
- Existing repository CI passing is not equivalent to live institution UAT.

## Module-by-module status

| Domain | Current implementation observed | Operational gaps before acceptance |
|---|---|---|
| Identity, tenant, roles | Neon Auth JWT verification, organization membership lookup, role/permission checks, RLS, restricted tenant runtime | Verified first-owner onboarding, two-identity/two-tenant live isolation test, campus-level authorization, account recovery and support runbook |
| Student master | Student list/create and allowlisted correction; profile data field exists | Complete admission-to-active-to-graduation/withdrawal lifecycle, sensitive-data separation, guardian linkage UX, document controls, exports and retention |
| Academic | Academic years, terms, programs, subjects, classes, enrollments, attendance sessions/records | Curriculum mapping, teaching schedules, gradebook, assessment, report cards, remedial, promotion, graduation, academic calendar and reporting |
| PPDB / admissions | Period creation/open/close, application intake/list/review, enrollment conversion foundations | Secure document upload, verification checklist, interview/test scheduling, decision notices, guardian portal, payment/registration, full audit and UAT |
| Boarding / student affairs | Dormitory/room/bed/assignment forms; leave and incident record foundations | Leave approval/return check, capacity and gender-policy enforcement, safeguarding escalation, restricted case access, guardian notification and follow-up workflow |
| Library | Catalog/copy management and circulation issue/return path | Renewal, overdue handling, policy-based fines, reservations, lost/damaged copy, collection audit and reconciliation |
| Finance/accounting | Chart of accounts, fiscal periods, balanced journal draft, posting/period guards | Billing, receipts, cash/bank, budget, journal review/reversal, bank reconciliation, financial statements, donor-fund restrictions and accountant review |
| Inventory | Item/warehouse master and append-only receipt/issue/transfer movement foundation | Stock opname, valuation, reorder, adjustment approvals, supporting documents, procurement integration and reconciliation |
| HR/payroll | Employee and payroll-period/run foundations; approval/payment API transitions and immutable approved payroll controls | Attendance, leave, contract lifecycle, payroll calculation, PPh 21, BPJS, THR, overtime, payslips, statutory reporting and employment-policy review |
| Procurement | Supplier, request/order and line-item records | Approval matrix, quotations/comparison, purchase order approval, receiving, invoice capture, three-way match, payment handoff and audit |
| Fixed assets | Asset register and append-only asset events | Depreciation, custody assignment, transfer approval, maintenance schedule, stocktake, disposal approval and accounting integration |
| CMS / announcements | Draft page and announcement records | Editorial approval, publish/unpublish scheduling, revision history, media safety, public rendering and accessibility review |
| CRM / alumni / donors | Contacts, interactions, donor pledges | Verifiable consent capture/withdrawal, suppression list, donation receipt, payment reconciliation, donor reporting and data retention |
| Sync / offline | Device registry, authenticated event inbox, idempotency/checkpoint foundation | Local outbox, domain event processor, conflict review, offline acceptance and device recovery |
| Reports / dashboard | Workspace shell and placeholder summary metrics | Data-backed KPIs, role-scoped reports, period filters, export provenance, reconciliation and scheduled reporting |
| PWA / operations | Installable shell and static asset cache | Private offline data policy, mutation queue, backup/restore rehearsal, monitoring, incident response and operator training |

## Cross-cutting risks

1. **Menu parity is not workflow completeness.** 39 UI resource definitions match 39 API resources and permission declarations, but generic list/create/edit screens cannot replace domain workflows.
2. **Operational dashboard metrics are placeholders.** The current workspace displays static/placeholder values; do not present them as live operational KPIs.
3. **Some UI forms expose raw UUIDs or JSON.** Replace with human-readable, tenant-scoped relation pickers and validated structured fields before general release.
4. **Approval and correction semantics vary by domain.** Financial, HR, procurement, leave, incident and publishing transitions need explicit state machines, maker-checker controls, reasons, and immutable audit.
5. **Compliance is not certification.** Regulatory mapping is a design aid. Verify current JDIH/Kemenag requirements and obtain competent legal/accounting review. Do not claim official EMIS/SIMTREN integration without owner authorization, specifications, credentials, and acceptance evidence.
6. **Data protection for minors is high priority.** Keep sensitive health, identity, safeguarding and guardian data out of general profiles and broad audit metadata; apply purpose limitation, least privilege, retention, export and incident procedures.

## Required acceptance gates

- [ ] Confirm the first company Super Admin identity using a verified Neon Auth account.
- [ ] Test activation request, approval, one-time token delivery, redemption, expiry, replay rejection, and audit trail on Development.
- [ ] Verify legacy bootstrap endpoint returns HTTP 410 in the deployed Development Function before removing its obsolete environment variable.
- [ ] Run two-tenant/two-user API tests against Development with real JWTs and confirm read/write isolation.
- [ ] For each module, test create, read, correction, invalid input, duplicate, unauthorized action, state transition, audit and tenant isolation.
- [ ] Add end-to-end workflows for every domain marked incomplete above.
- [ ] Verify backups and perform a restore rehearsal; document RPO/RTO and incident response.
- [ ] Conduct role-based UAT with synthetic data and representative operators.
- [ ] Obtain domain/legal review for applicable regulations and current Kemenag reporting requirements.
- [ ] Approve and apply any future database migrations to Development separately before considering Production.

## Execution order

1. Complete Central Command minimum activation UAT after verified Super Admin provisioning.
2. Stabilize first-owner onboarding and institution workspace.
3. Complete critical operational paths in this order: student/PPDB, academic, boarding/safeguarding, finance, inventory/procurement, HR/payroll, library, assets, CMS/CRM.
4. Build data-backed reports, exports, backup/restore and support/monitoring.
5. Run complete Development UAT and only then prepare a separate Production rollout proposal.

**No Production database, branch, Function, or deployment was changed by this audit.**
