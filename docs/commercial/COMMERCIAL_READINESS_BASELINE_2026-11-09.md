# PONDOK OS + Central Command — Commercial Readiness Baseline

**Assessment date:** 9 November 2026  
**Repository baseline:** `10402d1094bde8bef753ece464dcd7b5a79fb5a7`  
**Repository:** `n30AK/PONDOK-OS`  
**Target environments:** Neon Development `br-proud-paper-b312lfxi`; Staging `br-red-unit-b30ndbvw`  
**Production boundary:** Neon Production `br-late-cherry-b3uqtuvh` is excluded from this work.

## 1. Release decision

**NO-GO for general commercial release. NO-GO for production institutional operations.**

The repository has meaningful architecture, security controls, data foundations, UI workspaces, and automated build/test coverage. Those facts do not establish that the product can safely run a real pesantren's daily operations or that AKVISIO can fulfil commercial, support, legal, and recovery obligations.

A controlled pilot may be prepared only after the pilot-entry gates in section 7 pass. Pilot status must not be represented as general availability.

## 2. Verified baseline

### Platform and data foundations

- Development implementation-status snapshot records 67 organization-owned tables with RLS ENABLE and FORCE.
- A direct read-only Development query on 9 November 2026 reconfirmed 67/67 organization-owned tables with RLS ENABLE and FORCE, 26 migration ledger entries, and zero rows in organizations, organization memberships, student profiles, HR employees, platform customers, module entitlements and module orders.
- The same live inspection confirmed `core.organization_memberships` itself has RLS ENABLE + FORCE with platform-controlled insert and self/active-tenant or Super Admin read policies. This does not replace the pending two-tenant API isolation test.
- The implementation-status audit records 45 distinct read/write permission keys referenced by 44 module resources.
- The workspace/API contract records 44 module resources: 42 generic tenant-scoped resources plus dedicated encrypted student identity-document and health-profile handlers.
- Development snapshot records zero organizations, memberships, student profiles, and HR employees; no fabricated tenant or personal records have been seeded.
- Two-tenant API isolation using two independent real identities remains unaccepted.
- `STUDENT_IDENTITY_ENCRYPTION_KEY` was absent in the last documented Development audit. Identity-document operations must remain fail-closed until key provisioning, recoverable encrypted backup, and rotation/recovery are verified.
- CI #1286 and Neon Function bundle #225 passed for PR #144. PR #144 was merged as `10402d1094bde8bef753ece464dcd7b5a79fb5a7`. This verifies the tested build/unit-test pipeline for that change; it does not prove live tenant acceptance or post-merge production readiness.

### PONDOK OS module status

| Domain | Verified foundation | Commercial blocker / acceptance still required |
|---|---|---|
| Tenant and institution setup | Organization, campus, membership, role, permission and activation foundations | Real institution onboarding, legal identity/authority checks, owner handover, and two-tenant isolation UAT |
| Student and guardian master | Student profile, structured address, guardian relations, health and identity API foundations | Identity key/backup/rotation; consent and authority evidence; secure document vault; lifecycle and role-based UAT |
| PPDB | Admission period/application foundations | Full checklist, document handling, selection/interview, guardian portal, registration/payment, conversion to active student |
| Academic | Student/class/educator foundations | Curriculum versions, schedules, attendance correction, assessment, report cards, promotion/graduation and complete lifecycle |
| Boarding / kesantrian | Dormitory, room, bed, assignment, leave and incident resources | Approval, safeguarding, check-in/out, escalation, guardian communication and protected case handling |
| Finance/accounting | Chart of accounts, fiscal periods, journal draft/list, balanced-posting guard, period close and immutable posted journals | Full approval/posting UI, statements, budgets, cash/bank reconciliation, billing lifecycle and accountant UAT |
| Inventory/procurement | Item/warehouse/stock movement foundations | Requisition, approval, PO, partial receipt, issue/transfer, stock opname, valuation, returns and reconciliation |
| HR/payroll | Employee, payroll period/run, approval/payment foundations | Attendance, shifts, leave, versioned payroll formulas, PPh 21/BPJS/THR validation, payslips, payment and statutory review |
| Library | Catalog/copy/loan and issue/return foundations | Renewal, reservation, overdue, loss/damage, policy, fines where authorized, and reporting |
| CMS/announcements | Initial page and announcement workspaces | Editorial review, revision history, publishing/unpublishing, audience targeting and public rendering |
| CRM/alumni/donors | Contact, interaction and pledge foundations | Consent/withdrawal ledger, communication suppression, donation receipt, payment reconciliation and retention |
| Reports/dashboard | Report catalog and report-workspace foundations | Data-backed KPIs, scoped queries, filters, reconciled totals, PDF/XLSX/CSV controls, provenance and export audit |
| Offline/mobile/kiosk | PWA shell, device registry, event inbox, idempotency/checkpoint foundations | Local outbox, domain processor, conflict review, offline recovery, Android/iOS, installer signing and kiosk acceptance |

### Central Command status

Central Command must be assessed as AKVISIO's company operating system and platform control plane, not only as a Super Admin dashboard.

The existing 23-menu audit identifies these material gaps:

- Executive metrics are counts and limited control-plane indicators, not a complete KPI model.
- CRM has lead/customer/contact foundations but lacks full pipeline, activities, conversion and customer-success lifecycle.
- Product catalogue lacks complete package composition, module compatibility, price/version snapshots and publication governance.
- Quotes and contracts have approval foundations, but subscription lifecycle, renewals, amendments, proration, grace periods, suspension/cancellation and entitlement synchronization remain incomplete.
- Billing has invoice/payment and double-entry posting foundations, but tax configuration, credit/debit notes, refunds, recurring billing, dunning, aging, receipts and bank reconciliation remain incomplete.
- Accounting lacks complete manual journal controls, reversal, trial balance, GL drill-down, financial statements and bank reconciliation.
- Customer registry lacks full legal entity, authorized signatory, multiple branch/site, billing profile and customer 360 lifecycle.
- PR #146 corrected the prior menu mismatch: the request approval queue is now labelled **Permintaan Modul**, and a separate **Entitlement Registry** provides a Super Admin-only, read-only view of entitlements, orders and redacted lifecycle events. It intentionally exposes no grant/suspend/resume/revoke actions. The full order, approval, billing and provisioning lifecycle remains incomplete.
- Procurement, inventory, HRD, support, fleet, backup, warranty, documents and internal operations have data foundations and some initial-record forms. Initial record creation is not the same as approval, fulfilment, posting, resolution, restore, or other lifecycle completion.
- Reports and compliance are not complete report-generation or compliance-management systems.
- Agent runtime/dispatch must remain disabled until tool allowlists, scoped permissions, sandboxing, budget controls, approval UX, audit, evaluation, stop/kill switch and rollback are proven.

## 3. Mandatory safety and legal controls

1. Tenant scope must be enforced at API and database layers; never rely on UI hiding.
2. Test with at least two distinct tenant identities and prove cross-tenant reads, writes, relation pickers, exports and background jobs are denied.
3. Student data, child data, health data, identity documents, employee identifiers, tax data and bank data require purpose limitation, least privilege, masking, encryption, audit and retention controls.
4. Guardian contact, biological relationship, legal guardianship and pickup authority are separate facts. Pickup authority requires verified basis, validity dates and revocation history.
5. Sensitive exports require explicit permission, masking, reason where appropriate, audit, volume limits and safe file handling.
6. Posted accounting records are immutable; corrections use reversal/adjustment workflows.
7. Payroll formulas and tax/social-security rules must be versioned and reviewed for the applicable effective period. Do not claim tax or BPJS compliance solely from a successful calculation test.
8. Regulatory mappings must be reviewed against current official sources and applicability for the institution's legal form, education pathway, licence and location. Do not claim EMIS, SIMTREN, Dapodik, tax, or BPJS integration without official specifications, authorization and acceptance.
9. AI agents may inspect and propose. They must not autonomously approve payroll, payments, accounting postings, access grants, production deployments, data exports, remote commands, or destructive changes.
10. Production database, secrets, live customer records and tenant activation remain outside autonomous development changes.

## 4. Commercial operations required in Central Command

Before AKVISIO sells a subscription, the control plane needs tested workflows for:

- Customer prospect, qualification, activity history, consent and lead conversion.
- Legal entity and authorized signatory verification, customer contacts and branches/sites.
- Product, package, module/version compatibility, price books, limits and immutable offer snapshots.
- Quote, contract, signature evidence, DPA, SLA, renewal, amendment and termination.
- Subscription state, billing schedule, proration, grace period, dunning, suspension and resumption.
- Module entitlement grants/revocations bound to customer, tenant, installation, module/version and contract/subscription.
- Invoice numbering, tax profile, receipts, payment verification, refunds/credit notes, receivables and reconciliation.
- Customer onboarding checklist, data import, training, acceptance and go-live approval.
- Support cases, incident/SLA lifecycle, maintenance, warranty, repair and customer communication.
- Installation enrollment, device identity, telemetry consent, health monitoring, signed releases, rollback and support access consent.
- Backup policy, immutable/offsite retention, restore drills and documented RPO/RTO evidence.
- Security incident, vulnerability, privacy request, data export/return/deletion, breach response and audit evidence.

## 5. Prioritized work order

### P0 — Must pass before any pilot with real student data

- Close PR and post-merge pipeline verification; reconcile implementation documentation with current code.
- Provision identity encryption through approved secret management, test key length, backup, restore, rotation and fail-closed behavior.
- Complete two-tenant/two-user API and RLS isolation acceptance.
- Complete institution onboarding/activation with a verified authorized operator and real pilot institution.
- Complete student ↔ guardian ↔ legal authority ↔ PPDB conversion flows.
- Complete core academic and boarding daily workflows, including protected incident handling.
- Complete access review, audit evidence, backup/restore and incident response runbooks.
- Complete privacy notice, consent, retention and data-subject request procedures for pilot scope.

### P1 — Must pass before paid Limited Commercial Release

- Complete finance, receivables, payment and accounting lifecycle for the marketed package.
- Complete HR/payroll lifecycle for the marketed package, with effective-dated legal calculation review.
- Complete inventory/procurement and library workflows if those modules are included in the offer.
- Replace placeholder dashboard metrics with reconciled, role-scoped data.
- Complete Central Command customer, contract, subscription, entitlement and billing lifecycle.
- Complete support, SLA, maintenance, backup and restore operations.
- Publish explicit service scope, SLA, support hours, data processing terms, onboarding and exit/export terms.
- Execute pilot UAT, defect triage, sign-off and rollback rehearsal.

### P2 — Required before General Availability or the relevant edition is advertised

- Android/iOS release and signing.
- Offline installer, local identity/database setup, sync conflict resolution and recovery acceptance.
- Kiosk/wall display and guardian portal acceptance.
- Government/external integrations only after official technical and authorization acceptance.
- Agent runtime only after safety, permission, sandbox, budget, approval, audit and rollback acceptance.
- Capacity, performance, availability, disaster recovery and security assessment appropriate to the service commitments.

## 6. Definition of done for every marketed module

A module cannot be marked operational or included in a commercial package until evidence exists for all applicable items:

1. Approved domain specification, roles, data classification and regulatory applicability.
2. Database migration and constraints applied to the intended non-production environment.
3. Authenticated API with server-side authorization for reads, writes and state transitions.
4. Tenant and campus scope plus cross-tenant denial tests.
5. UI forms and workflow states with loading, error, empty, validation and permission handling.
6. Domain lifecycle, approvals, maker-checker controls and idempotency where applicable.
7. Audit events for sensitive reads, exports, state changes and approvals.
8. Unit, integration, authorization, regression and end-to-end tests.
9. Backup/restore, retention, monitoring and runbook coverage appropriate to risk.
10. UAT evidence from the pilot institution, including role-based sign-off and reconciled outputs.
11. Accurate release notes and a documented list of excluded/limited capabilities.

## 7. Pilot-entry and release gates

| Gate | Required evidence | Current status |
|---|---|---|
| G0 — Engineering baseline | Main build, CI, API bundle, Pages/release artifacts and no unresolved critical defects | Partial; PR #144 CI and API bundle passed; post-merge release evidence still needs checking |
| G1 — Security baseline | Two-tenant isolation, identity-key lifecycle, audit, backup/restore and access review | Blocked |
| G2 — Institution onboarding | Verified institution, authorized Super Admin approval, tenant activation, owner handover | Blocked; Development has no institution tenant in the last audit |
| G3 — Core operational UAT | Student/guardian/PPDB, academic, boarding, finance and HR flows for pilot scope | Blocked |
| G4 — Commercial operations | Contract, subscription, entitlement, invoice/payment, support/SLA and offboarding | Blocked |
| G5 — Pilot acceptance | Real users, role-based test scripts, defect closure, reconciled reports, signed acceptance | Blocked |
| G6 — Limited Commercial Release | Published scope, pricing/terms, support, security and operational sign-off | Blocked |
| G7 — General Availability | Capacity, DR, mobile/offline as advertised, integrations and sustained operations | Blocked |

## 8. Release communication rule

Until G0–G5 are evidenced, describe the product as **Development / controlled pilot preparation**, not commercial-ready. A successful build, green health endpoint, menu, database table, generic CRUD form, or demo dataset is not proof of commercial readiness.

Do not mark the entire platform ready when only selected modules have passed. Commercial packages must identify exactly which modules and deployment modes are accepted, and which are still roadmap or pilot-only.


## Update after PR #146 (2026-11-09)

- PR #146 merged as `c5694cd24f36a34cf89e210bbeb2b7e7f1f55e15`. CI #1299 completed successfully across migration checks, RLS, workspace typecheck/build, Pages checks, Neon Function bundle, container build/smoke tests and unit tests; Neon Function bundle #227 also passed.
- Central Command now has separate **Permintaan Modul** and read-only **Entitlement Registry** pages. The registry returns entitlement, order and redacted lifecycle-event datasets after active Super Admin authorization. It does not mutate entitlement state.
- The registry SQL was checked read-only against the live Development schema. The Development tables currently contain zero customers, module entitlements and module orders, so no live customer workflow was exercised.
- No schema, migration, seed, secret, Neon Development write or Neon Production change was made by PR #146. Post-merge deployment workflows have not been independently confirmed in this checkpoint.


## Update after PR #147 (2026-11-09)

- PR #147 merged as `5714030418083c43e3800ecfb88c065c6dfaf265`. CI #1301 and Neon Function bundle #229 passed.
- Added unit tests for the actual `withTenantScope` and `loadTenantContext` helpers: authenticated user/organization context is bound inside a transaction, a user cannot load another organization's membership by changing the selected organization, and transaction-local role/context is cleared before pooled connection reuse.
- These are automated helper tests using synthetic identities and a query double. The existing disposable-PostgreSQL RLS test separately checks two synthetic tenants at database level. Live API acceptance with two real authenticated users and two actual non-production organizations remains pending; G1 is still blocked.
