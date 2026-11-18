# PONDOK OS — Module Readiness & Acceptance Register

**Snapshot:** 2026-11-18  
**Audience:** internal product, implementation, QA and release teams  
**Purpose:** distinguish implemented foundations from customer-usable workflows, state prerequisites, and define evidence required before a module is included in a paid implementation.

> This register is an engineering readiness aid, not a product certification, legal opinion, compliance guarantee, or promise that every listed capability is available. Statuses are conservative and must be refreshed against the exact candidate commit and Development evidence before customer commitments.

## 1. Readiness vocabulary

| Status | Meaning | Customer commitment |
|---|---|---|
| Foundation | Schema/API/UI foundations or selected CRUD paths exist; lifecycle acceptance is incomplete | Do not sell as an operationally complete module |
| Partial workflow | One or more bounded workflows exist, but important transitions, controls, reports or UAT are missing | May be demonstrated only with explicit limitations and controlled demo data |
| Pilot candidate | Exact scope has passed module-specific role, security, data and operational UAT for a named pilot | Only the accepted scope may be included in that pilot |
| Operationally accepted | Full agreed lifecycle, controls, reconciliation, support and evidence pass for the declared scope | May be offered only within the accepted configuration and support envelope |
| Roadmap | Design or catalog entry only; no operational workflow evidence | Do not represent as available |

A green CI, a menu item, a form, a successful health check, or a database row is not sufficient to move a module to Pilot candidate or Operationally accepted.

## 2. Module readiness register

| Module | Verified foundation / bounded capability | Current readiness | Data and configuration prerequisites | Minimum module UAT before offer |
|---|---|---|---|---|
| Master Santri & Wali | Student profile, structured address, guardian relations, educator/employee profile foundations; dedicated health and identity-document paths have separate protection requirements | Foundation; sensitive identity path remains fail-closed until its key lifecycle is approved and tested | Institution/campus structure; student lifecycle codes; guardian relationship and authority evidence; field ownership; data classification; retention; verified identity-key provisioning through approved vault | Create/update permitted profile; verify guardian authority; deny unauthorized health/identity reads; validate masking, audit, retention and tenant boundary; test lifecycle changes |
| PPDB & Penerimaan | Admission period/application intake, listing/review and enrollment-conversion foundations | Partial workflow | Admission period, required document checklist, selection stages, decision authority, enrollment rules, fee mapping and authorized data owners | Applicant submission → review → decision → accepted applicant conversion; duplicate prevention; document access controls; audit and guardian communication; denial for unauthorized campus |
| Akademik | Academic year/term, program, subject, class, enrollment, attendance and assessment foundations | Foundation | Calendar, curriculum, grade scale, subject/class mapping, teaching assignments, attendance policy, assessment weights, promotion rules and report templates | Enroll student; assign class/subject/teacher; record and correct attendance with audit; assess; generate reconciled report; verify class/teacher scope and correction approvals |
| Kesantrian & Asrama | Dormitory, room, bed, assignment, leave and incident record foundations | Foundation | Dormitory/campus hierarchy, capacity, placement rules, safeguarding roles, leave types, approval chain, guardian notification policy and restricted-case classification | Assign/reassign bed; enforce capacity and placement rules; request/approve/return leave; restrict safeguarding cases; verify escalation, audit and guardian follow-up |
| Keuangan & Akuntansi | Chart of accounts, fiscal periods, balanced journal draft, posting/period guards and immutable posted-journal foundations; maker-checker journal controls have been merged | Foundation / partial finance controls; not a complete accounting suite | Approved chart of accounts, fiscal periods, opening balances, cost centers/funds, cash/bank accounts, approval matrix, accounting policies, tax configuration reviewed by qualified personnel and reconciliation ownership | Draft → validate balanced journal → independent review/approval → post; reject self-approval, duplicate posting and closed-period posting; reversal/correction without mutating posted history; reconcile source transactions and trial balance |
| SDM & Penggajian | Employee, organizational structure, payroll period/run and approval/payment foundations | Foundation | Employee categories and contracts, effective-dated salary components, attendance/leave inputs, overtime, THR, BPJS/PPh 21 rule versions, bank/payment roles and compensation access policy | Onboard employee; validate period inputs; calculate with reviewed rule version; maker-checker approval; lock and payment evidence; payslip privacy; payroll journal reconciliation; negative tests for unauthorized compensation access |
| Inventaris & Gudang | Item, warehouse and append-only stock movement foundations | Foundation | Item units/categories, warehouse hierarchy, opening stock, valuation method, custody roles, stock policy and accounting integration rules | Receive/issue/transfer; reject invalid quantities and cross-warehouse access; reconcile stock ledger; test append-only corrections, approvals and audit |
| Pengadaan & Aset | Supplier, request/order, line-item, asset register and asset-event foundations | Foundation | Supplier verification, quotation rules, approval thresholds, budget/cost center, receiving evidence, asset classification and depreciation policy | Request → quotation/comparison → approval → purchase order → receiving → invoice handoff; three-way match; asset custody/transfer/disposal approvals; reconcile inventory and finance |
| Perpustakaan | Catalog/copy and initial issue/return circulation path | Partial workflow | Bibliographic standards, copy/barcode policy, borrower eligibility, loan periods, quota, renewal/fine policy and collection owner | Catalog and copy creation; issue/return; renewal/overdue/lost/damaged paths; circulation reconciliation; borrower lookup returns minimum scoped fields |
| CRM, Wali, Alumni & Donatur | Contact, interaction and donor-pledge foundations | Foundation | Consent purpose/channel, communication preference, suppression rules, relationship ownership, donation receipt and finance mapping | Record consent/withdrawal; suppress prohibited communication; manage interaction; reconcile donation pledge/payment/receipt; enforce access and retention |
| CMS & Informasi Publik | Initial page and announcement workspace foundations | Foundation | Editorial roles, content ownership, publication calendar, revision policy, media review, accessibility and public disclosure rules | Draft → review → approve → publish/unpublish; preserve revision history; verify public output, media safety, accessibility and audit |
| Unit Usaha / Koperasi | Solution concept only; no verified end-to-end operational workflow in the readiness baseline | Roadmap | Legal business unit, product/catalog, pricing, inventory, cash/bank, tax, POS/payment and accounting policy | Do not offer until sales, purchase, stock, cash, returns, reconciliation and legal/tax workflows pass |
| Sekolah & Madrasah | Development direction and integration concept; no active government connection is established | Roadmap | Legal status and education-unit type; applicable Kemenag/Dikdasmen rules; operator roles; official data formats and integration authorization | Validate each applicable reporting workflow against current official sources; test export/import and correction; do not claim live government integration without a verified authorized connection |
| AI & Otomasi | Roadmap for assistant recommendations and human-approved automation; no autonomous agent runtime is approved for customer operations | Roadmap | Tool allowlist, data classification, scoped permissions, sandbox, budget, timeout, audit, evaluation, human approval and kill switch | Read-only recommendation evaluation; prompt/data leakage tests; deny unapproved actions; prove human approval, audit correlation and emergency stop before any write-capable pilot |

## 3. Cross-module prerequisites

No module moves beyond Foundation solely because its UI or CRUD endpoint exists. Before a scoped pilot, the implementation record must identify:

1. **Institution configuration:** tenant, campuses, departments/units, academic/business periods and responsible data owners.
2. **Identity and access:** verified users, approved memberships, role/permission matrix, scope assignments where required, independent approvers and tested revocation behavior.
3. **Data readiness:** source, format, owner, validation rules, deduplication policy, lawful basis, classification, retention and import sign-off. Do not use fabricated personal data as pilot evidence.
4. **Workflow ownership:** preparer, reviewer, approver, executor, escalation owner and separation-of-duties rules.
5. **Operational controls:** audit events, idempotency, concurrency/version behavior, failure/retry behavior, monitoring and support escalation.
6. **Privacy/security:** tenant isolation, least privilege, field-level minimization, encryption where required, masking, attachment controls and export restrictions.
7. **Evidence:** exact commit, PR, CI run, Development deployment, test identities/roles, redacted results, unresolved defects and signed acceptance.

## 4. Minimum security and quality acceptance per module

- **Authorization:** test both allowed and denied operations for each role; include guessed IDs, forged relationship IDs, expired/revoked access and cross-tenant requests.
- **Scope:** verify campus, class, subject, department, warehouse, dormitory or other assigned scope at the API/query layer. Hiding a menu is not authorization.
- **Data minimization:** explicit response projections; no generic `SELECT *` for sensitive or mixed-classification resources; return only fields needed by the workflow.
- **Audit:** record actor, tenant, action, target, timestamp, correlation ID and approval context without logging secrets or unnecessary personal data.
- **Financial integrity:** maker-checker where applicable, idempotency, immutable posted history, reversal/adjustment, period guards and reconciliation.
- **Files:** validate content signature/MIME/size, quarantine and malware scan, private access, short-lived download authorization, audit and binary backup/restore.
- **Resilience:** backup and restore evidence must cover database, attachment binaries and recoverable encryption-key material. A policy row or successful backup job alone is insufficient.
- **Usability:** test responsive layouts, keyboard/accessibility, validation messages, empty/loading/error states and recovery from interrupted operations.
- **Acceptance:** document expected/actual outcomes and obtain approval from the institution's authorized owner.

## 5. Explicit exclusions from current customer-ready claims

Until separately implemented and accepted, do not advertise or contract these as currently available:

- Complete institution-wide end-to-end workflows across all modules.
- Live two-tenant Neon Auth acceptance with two independent real users and two authorized Development tenants.
- Member-level campus/class/subject/department/dormitory/warehouse scope enforcement across every domain.
- Complete identity-document key provisioning, rotation and recovery; those operations remain fail-closed until approved.
- Secure attachment upload/download lifecycle with malware scanning, quarantine, binary versioning and tested restore.
- Automated immutable off-site backups and a successful isolated restore drill.
- Full finance suite including bank reconciliation, financial statements, budgets, receivables/payables lifecycle, refunds and tax acceptance.
- Full payroll calculation and Indonesian tax/BPJS legal acceptance.
- Complete PPDB, academic, boarding, procurement, asset, library and CMS lifecycles.
- Active government integration, certified regulatory compliance, or blanket legal compliance guarantee.
- Production-ready Android/iOS applications, offline installer, full hybrid synchronization or wall-display kiosk.
- Autonomous AI agents that can approve, grant access, post financial transactions, activate tenants or deploy changes.

## 6. Release and change-control boundaries

- Neon Production branch `br-late-cherry-b3uqtuvh` remains strictly out of scope.
- No Development schema, migration, seed, tenant, membership, credential or secret changes are authorized by this document.
- Any Development database change requires separate explicit approval and must use the repository migration runner, branch/PR/CI and Development-only deployment.
- Institution activation remains subject to the official Central Command flow and independent Super Admin approval; no self-approval.
- A limited pilot requires a named institution, explicitly accepted modules, authorized test users, data handling plan, support owner and signed UAT.
- General commercial release remains NO-GO until the relevant security, resilience, operational, legal and commercial gates are evidenced.

## 7. Evidence references

- `docs/architecture/implementation-status.md`
- `docs/OPERATIONAL_READINESS_AUDIT_2026-11-04.md`
- `docs/security/tenant-scope-api-audit-2026-11-13.md`
- `docs/commercial/COMMERCIAL_READINESS_BASELINE_2026-11-09.md`
- GitHub issues #252, #253, #254 and #255

This register consolidates the current known limitations; it does not replace source-code review, live Development tests, institution UAT or qualified legal/tax review.
