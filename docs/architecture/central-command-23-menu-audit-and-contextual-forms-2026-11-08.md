# Central Command — Audit 23 Menu & Contextual Form Specification
**Audit date:** 8 November 2026  
**Repository baseline:** `22a02e8130ad72a3ea5a43569d65cd92a0ce29a3`  
**Database checked:** Neon Development `frosty-cherry-92983148 / br-proud-paper-b312lfxi / neondb`  
**Production:** not queried, changed, migrated, or deployed.

## 1. Executive finding

Central Command currently renders all 23 menu entries, but visibility is not equivalent to a functioning business workflow.

- **5 custom transactional workspaces exist:** CRM, Product Catalog, Commercial Quotes/Contracts, Billing, and Accounting.
- **11 domains use one generic read-only data viewer:** Support, Fleet, Backup, Warranty, Reports, Agents, Procurement, Inventory, HRD, Internal Operations, and Documents. The viewer fetches `GET /v1/platform/erp/operations/:domain`, shows up to 100 rows per dataset, supports local text filtering and CSV export, and has no create/update/approve/resolve/restore form.
- **7 platform/control-plane pages exist:** Executive Dashboard, Customer/Branch Registry, Module Requests, Activation, Security/Audit, Regulations, Publisher. These have varying partial functions; they are not equivalent to full domain workspaces.
- Current database catalog contains **80 `platform` tables; 79 have RLS enabled and FORCE enabled**. The single exception is `platform.super_admins`, a global control-plane table; its access must remain server-only and explicitly tested. This is not a substitute for API authorization tests.
- Development migration ledger has **26 applied migrations, latest 0026**. Migrations 0024, 0025, 0026 are recorded as applied on 8 November 2026. Some status text in the app still says 0024/0025 are pending; that text is stale and must be corrected.
- Development currently has no actual customer/tenant operational records in the sampled business tables (customers, leads, products, contracts, subscriptions, invoices, journals, support cases, installations, agents, vendors, purchase orders, warehouses, fixed assets, company employees, document registry all returned 0). A single platform audit event exists. Therefore, an empty table is not evidence that a page's read API is broken; it means there is no test/customer data to exercise it against.
- The code's API read-only domains are explicitly protected by Super Admin authorization and return `domain_schema_not_deployed` on missing tables. The database schema is present for the 11 read-only domains, but the transaction APIs and contextual forms are not.

**Current operational conclusion:** the Central Command navigation is present and several workflows have working foundations, but it is **not a complete company ERP or operational control plane**. Most menu entries are data viewers, not transaction modules.

## 2. Menu-by-menu implementation audit

Status meanings:
- **Partial transaction:** a contextual form and some API transitions exist, but important lifecycle, validation, reporting, or integrations are missing.
- **Read-only:** API exposes GET datasets only; no transaction form/actions in the current workspace.
- **Static/limited:** hard-coded reference or narrow admin action, not a complete module.
- **Control-plane partial:** one control-plane workflow exists, but not the full business capability named by the menu.

| # | Menu | Current implementation observed | What is not complete |
|---|---|---|---|
| 01a | Executive Dashboard | Counts tenants, active tenants, pending activation requests and module requests; shows a few pending activations and control-plane connection indicators. | No consolidated finance/sales/renewal/support/fleet/security KPI engine, drill-down filters, saved dashboards, metric definitions, period comparisons, data freshness/lineage, or tenant-scoped management reports. |
| 01b | KPI & Management Reports | Read-only report/assurance datasets through generic viewer; CSV export. | No report designer, parameterized report forms, PDF generation, scheduled delivery, approval, distribution lists, report snapshots, or export expiry/download workflow. |
| 02 | Leads, Pipeline & Sales | Lead create/list; lead stage PATCH; customer create/list; customer contact create/list. | No opportunity/deal object, activity/task/meeting/call timeline, sales owner assignment UI, follow-up task queue, probability/forecast, lead conversion wizard, deduplication/merge, quote linkage on pipeline board, campaign attribution, or consent lifecycle UI. |
| 03a | Produk & Paket Modul | Product create/list form in UI; API also exposes product PATCH, but the current workspace has no edit action. Product type, price, billing interval and active flag are represented. | No package/bundle composition, price books, tier limits, module/version/dependency mapping, compatibility matrix, trial policy, change history, publication approval, or immutable price/version snapshots for the catalogue itself. |
| 03b | Kontrak & Subscription | Quote create/submit/approve/reject; contract create/submit/approve/reject; contract dates and renewal mode. | No subscription activation/renewal/amendment/suspension/cancellation, proration, grace period, dunning, signature lifecycle, contract version history, addendum, DPA/SLA attachment, or automated entitlement synchronization. |
| 03c | Customer & Branch Registry | Registry list of organizations/tenants; first-tenant bootstrap form creates an organization, main campus, membership and owner role. | No full customer legal-entity profile editor, multiple branch/site CRUD, parent-child customer group, NPWP/NIB and legal-document verification, contacts/authorized signatories, branch lifecycle, billing profile, or customer 360. |
| 03d | Module Entitlements | Current UI lists `platform.module_requests` and approves/rejects submitted module requests. | This is a **request queue**, not an entitlement manager. No UI to grant/revoke/suspend/renew entitlement rows, bind customer + installation + module/version + contract/subscription, set seat/usage limits, expiry, offline grace, or inspect lifecycle events. |
| 03e | Onboarding & Activation | Activation request list and approve/reject; bootstrap-first-tenant exists; activation token is issued in the control-plane flow. | No guided onboarding checklist, legal-document checklist, identity/authority verification, data-processing terms, technical readiness, branch/import mapping, module provisioning checklist, owner handover, training, acceptance, or go-live sign-off. |
| 04 | Invoice & Payments | Draft invoice from active contract/approved quote; issue invoice and post receivable/revenue/tax journal; record pending payment; verify/reject payment with creator-self-approval guard. | No tax profile/configuration and effective-dated rules, invoice numbering series, full invoice line editing, e-Faktur/Coretax integration, credit note, debit note, refund, allocation across invoices, bank reconciliation, recurring invoice scheduler, reminders/dunning, aging/statement, receipt PDF, or dispute workflow. |
| 05 | General Ledger & Finance | Initialize default chart of accounts; read chart accounts and posted journals. Invoice/payment transitions post balanced journals. | No contextual manual journal form, journal approval, reversal workflow, fiscal-period lock/close, trial balance, GL drill-down, P&L, balance sheet, cash flow, bank/cash book, reconciliation, budgets, cost centers, fixed-asset depreciation posting, or accounting-policy configuration per legal entity. |
| 06 | Procurement & Vendors | Read-only vendor, requisition, RFQ, PO and goods-receipt datasets. | No vendor onboarding/due diligence form, vendor contacts CRUD, purchase requisition with lines, budget check/approval, RFQ invitation, quote capture/comparison, conflict-of-interest declaration, PO approval, receipt inspection/partial receipt, supplier invoice, three-way match, return, vendor scorecard, or payment handoff. |
| 07 | Inventory & Fixed Assets | Read-only warehouses, stock balance derived from movements, transfers, fixed assets and asset events. | No item/SKU/UOM master, warehouse/location CRUD, receipt/issue/adjustment form, transfer request/approve/dispatch/receive, stock count and variance approval, lot/serial/expiry, valuation policy, asset capitalization, depreciation, maintenance, impairment, disposal, barcode/QR, or reconciliation. |
| 08 | People, HR & Payroll | Read-only departments, employees, assignments, attendance, leave, payroll periods/runs and payroll items. | No employee/contract onboarding, employee changes/offboarding, secure identity/tax/bank capture, attendance corrections, shifts, leave request/approval, overtime, salary components, payroll calculation, PPh 21, BPJS, THR, payslip, payroll approval/payment, statutory outputs, or employee self-service. |
| 09a | Support, Incident & SLA | Read-only support cases and installation incidents. | No ticket creation, assignment, category/priority, SLA policy, acknowledge/escalate, customer communication, linked problem/change, RCA, resolution, customer confirmation, reopen, or SLA breach automation. |
| 09b | Warranty & Repair | Read-only warranty agreements, claims, repair logs/events. | No claim intake, serial/installation verification, coverage/eligibility decision, exclusions, evidence upload, technician assignment, diagnosis/parts/labour, repair state transitions, approval, billable work, invoice linkage, customer acceptance, or warranty analytics. |
| 10 | Company Operations | Read-only budgets, expense claims, company assets and asset events. | No department/role setup, budget create/revise/approve, employee expense submission, receipt upload, policy validation, multi-level approval, reimbursement, internal purchase request, asset issue/return, or company policy acknowledgement. |
| 11 | Documents & Archive | Read-only document registry, version metadata and access-event datasets. | No secure upload/download/view, object storage lifecycle, MIME/signature scanning, checksum validation on upload, version creation, approval/signature, retention schedule, legal hold, disposition/destruction approval, classification policy enforcement, or document access request. |
| 12a | Client Installations | Read-only installations, health checks and redacted logs. | No installation registration/enrollment, device identity/certificate rotation, customer/site mapping workflow, connector setup, telemetry policy consent, heartbeat alert configuration, maintenance windows, remote session consent, signed remote-job approval/dispatch, release rollout/rollback, or offline sync conflict resolution. |
| 12b | Backup & Disaster Recovery | Read-only backup policies and backup/restore run history. | No policy authoring/approval, actual backup executor, destination credentials via secret references, retention enforcement, immutable/offsite controls, checksum verification, restore execution, restore evidence, RPO/RTO breach workflow, or disaster-recovery exercise sign-off. |
| 13 | Agent Operations | Read-only agent runs, security findings, remote jobs and approval requests. Runtime/dispatch remains disabled. | No agent registry/configuration UI, capability/tool allowlist, model/version policy, scoped data access, task queue, approval UX, sandbox, budgets, evaluation, redaction test, stop/kill switch, rollback, or governed job execution. |
| 14a | Security & Audit | Security-control explainer cards and latest platform audit-event table. | No role/permission administration UI, MFA enforcement dashboard, session/device review, access recertification, secret metadata/rotation tracking, security incident intake/response, vulnerability remediation, DPIA, breach-notification workflow, audit search/filter/export/retention, or immutable evidence package. |
| 14b | Regulations & Compliance | Static hard-coded list of selected regulations with external source links. | No regulation master/versioning, amendment monitoring, applicability assessment per product/customer/legal entity, obligation register, evidence mapping, control owner, due date, compliance review, gap/remediation workflow, or local/provincial requirements. |
| 14c | Publisher & Integrations | List/grant/revoke publisher by user UUID. | No publisher organization/profile, verified legal identity, signed module manifest/package, integration registry, API scopes, OAuth credentials, webhook endpoints, secret references/rotation, sandbox test, connector health, approval, versioning, or incident/revocation process. |

## 3. Why menus appear to do nothing

The sidebar navigation changes `section` state and renders the selected component. For the 11 read-only domains, `OperationalDataWorkspace` calls `GET /v1/platform/erp/operations/:domain`. The API handler only accepts GET and returns `405 method_not_allowed` for every other method. The component has a search box, refresh and CSV export only. Thus, a user can open the menu and see a table but cannot create or progress a business transaction there.

The following menu is a naming/functional mismatch: **Module Entitlements** renders the module-request approval queue backed by `platform.module_requests`; the separate `platform.module_entitlements` table has no corresponding entitlement-management workspace.

The **Executive Dashboard** currently reports counts, not a full executive KPI model. The **Regulations & Compliance** page is a static list, not a compliance-management system.

## 4. Contextual form specification — target forms by menu

The fields below are a design baseline, not a declaration that every field is legally mandatory. Each field must have an applicability rule (`required`, `optional`, `conditional`, `not_applicable`) based on legal entity, customer type, institution type, employment relationship, product, and transaction. Do not force pesantren-specific fields onto a PT customer or school-specific fields onto a non-school pesantren. Store field-level legal provenance and review date.

### 01a. Executive Dashboard — filter and KPI configuration
**Filter panel:** date range, comparison period, customer/legal entity, tenant/branch, product/module, subscription state, invoice/payment state, installation environment, support severity, region, data freshness.  
**KPI definitions:** metric key/name, formula/version, owner, source tables, inclusion/exclusion rules, currency conversion date/source, refresh interval, target/threshold, alert severity.  
**Dashboard preferences:** layout, saved view, access audience, default filters, sharing scope.  
**Controls:** drill-down to authorized source records; show as-of timestamp, source and calculation version; never mix tenant and platform finance without explicit scope.

### 01b. KPI & Management Reports
**Report request:** report template, reporting period, timezone, customer/tenant, branch/site, product, parameters, comparison period, output format (CSV/PDF), classification, purpose, requested-by.  
**Distribution:** recipient identities, authorization, delivery channel, schedule, expiry, download limit, approval state, delivery evidence.  
**Assurance report:** availability, incident summary, security findings, backup/restore evidence, SLA, maintenance, open risks, recommendations, evidence manifest, reviewer, approver, customer-visible redactions.

### 02. Leads, Pipeline & Sales
**Lead identity:** organization name, legal/display name if known, entity type, website, address/city/province, source/campaign/referral, lead owner, created date.  
**Contact:** full name, title/authority, email, phone, preferred channel/time, primary flag.  
**Qualification:** customer segment, institution/business type, approximate user/site count, need/problem, target modules, deployment preference (cloud/hybrid/offline), budget range, decision timeline, competing solution, probability, expected close date.  
**Privacy/marketing:** purpose, lawful basis, notice version, consent status/date/source, opt-out/withdrawal timestamp; separate service communications from marketing.  
**Pipeline:** stage, next action, follow-up date, owner, activity log, outcome, lost reason, conversion link to customer/quote.  
**Validation:** duplicate detection, valid email/phone, stage-transition rules, lost reason required for lost, follow-up required for active qualified opportunities.

### 03a. Produk & Paket Modul
**Product master:** SKU/code, name, description, category, product type, service/digital/software, status, owner, tax treatment profile, currency, unit of measure.  
**Commercial model:** one-time/recurring, interval, base price, tier, discount policy, trial duration, setup/implementation fee, maintenance fee, renewal rules.  
**Package composition:** included modules, module versions/ranges, dependencies, exclusions, seat/user/site limits, storage/API/usage quotas, offline rights, allowed environments, compatibility.  
**Service commitments:** support tier, SLA policy, availability target, maintenance window, support hours, response/resolution targets.  
**Lifecycle:** draft/review/approved/published/retired, effective dates, version, change note, approver, immutable snapshot.  
**Validation:** prevent publishing incompatible dependencies; never silently change the commercial terms of an existing quote/contract/subscription.

### 03b. Kontrak & Subscription
**Contract parties:** customer legal entity, provider legal entity, authorized signatories, authority evidence, billing/tax address.  
**Contract terms:** contract number, quote snapshot, scope, modules, quantities, service levels, implementation milestones, start/end, renewal mode, notice period, suspension/termination rules, payment terms, currency, tax profile.  
**Legal attachments:** signed contract, addenda/version, DPA/controller-processor roles, subprocessors, confidentiality, IP/license, support/SLA, offline installer rights, data export/return/deletion on termination.  
**Subscription:** product/plan, quantity, start/end, next bill date, billing interval, price snapshot, discount, grace period, status, cancellation reason, proration rule.  
**Workflow:** draft → review → approved → signed → active → amended/renewed/suspended/cancelled/expired. Record maker/checker and signed evidence; contract approval must not itself imply tenant/module activation.

### 03c. Customer & Branch Registry
**Legal entity:** legal name, display name, entity type (PT, CV, yayasan, koperasi, individual, government, other), deed/establishment number/date, notary (where applicable), AHU/legalization reference (where applicable), NIB, NPWP (encrypted), PKP status, tax address, registered address, business/activity classification where relevant.  
**Authorized people:** director/management/authorized representative, role/title, authority basis, identity proof reference, email/phone, validity dates.  
**Customer account:** customer code, segment, owner, billing contact, finance contact, support contact, risk/status, payment terms, credit limit, currency, data-processing role.  
**Branch/site:** parent customer, branch/site code, name, physical address, province/city, timezone, site PIC, contact, active dates, service/installations, campus/site type.  
**Conditional institution profile:** institution pathway/type; Kemenag registration/NSP/EMIS references only where applicable and verified; school NPSN/Dapodik references only where applicable and authorized. Do not infer official status from a typed number.  
**Validation:** legal-entity-specific requirements, duplicate NPWP/NIB with restricted access, unique branch codes, authority expiry warnings, verified-source evidence.

### 03d. Module Entitlements
**Grant target:** customer, tenant/organization, branch/site, installation/device, module key, exact module version/compatibility range.  
**Commercial source:** contract, subscription, order, invoice/payment state, trial/comp/partner source, approval request.  
**Entitlement:** status, quantity/seats, usage quota, feature flags, start/end, renewal date, grace period, offline lease expiry, environment, region, dependencies.  
**Change request:** grant/upgrade/downgrade/suspend/resume/revoke, reason, effective date, requested-by, approved-by, idempotency key, ticket/reference.  
**Audit:** before/after state, lifecycle event, actor, source, correlation ID, installation acknowledgement. Enforce no active entitlement without an approved commercial/exception basis.

### 03e. Onboarding & Activation
**Intake:** request ID, requester identity/contact, legal entity, institution type, customer/branch details, intended modules, deployment mode, data migration needs.  
**Evidence checklist:** deed/legal proof, NIB/NPWP as applicable, authority/mandate, institution permit/registration where applicable, signed agreement, DPA, payment/order evidence.  
**Technical readiness:** domain, DNS/TLS, tenant owner identity, MFA, backup contact, data region, integration requirements, encryption-key readiness, recovery contact, import mapping and validation.  
**Provisioning:** tenant, branch/campus, roles, plan, entitlements, modules, initial configuration, migration batch, training sessions.  
**Approval and handover:** reviewer, findings, remediation, decision, activation token issuance/expiry/consumption, owner acceptance, go-live checklist, support handover. Never create a tenant from unverified synthetic details in shared Development/Production.

### 04. Invoice & Payments
**Issuer profile:** legal entity, NPWP, PKP status, tax address, bank/payment accounts, invoice series, authorized signer.  
**Invoice header:** customer, contract/subscription/order, invoice date, due date, currency, exchange rate/source/date, payment terms, billing period, PO reference.  
**Lines:** product/service, description, quantity, unit, unit price, discount, tax category, tax base method, VAT rate/effective rule, withholding tax treatment, line total.  
**Settlement:** payment reference, date, method, bank/gateway, external transaction ID, amount, currency, evidence, allocation, verification by different actor, refund/chargeback status.  
**Documents:** invoice PDF, tax invoice/e-Faktur reference where applicable, receipt, credit/debit note, customer statement.  
**Controls:** effective-dated tax rules; separate tax calculation from UI; no hard-coded VAT rate; enforce duplicate idempotency, amount not exceeding outstanding, segregation of duties, bank reconciliation.

### 05. General Ledger & Finance
**Accounting setup:** legal entity, fiscal year, fiscal period, accounting basis/policy, functional currency, chart of accounts, account hierarchy, normal balance, control account, tax mapping, cost center/project/fund.  
**Journal form:** journal number, date, period, source/document, description, currency/rate, line items (account, debit, credit, customer/vendor, site, cost center, tax code, memo, attachment).  
**Review:** preparer, reviewer, approver, posting date, lock status, reversal reference, correction reason.  
**Finance operations:** cash/bank accounts, bank statement import, matching rules, reconciliation differences, budget, actuals, commitments, forecast.  
**Reports:** trial balance, GL, P&L, balance sheet, cash flow, receivables/payables, budget variance, audit package.  
**Controls:** debit equals credit, period open, unique posting key, immutable posted journal, reversal rather than destructive edit, policy per legal entity (do not impose one chart of accounts on all customers).

### 06. Procurement & Vendors
**Vendor master:** legal/display name, entity type, NIB/NPWP where applicable, registered/address, contact people, bank account (encrypted), payment terms, currency, products/services, tax status, beneficial/related-party declaration where required by policy, risk rating, verification documents, status.  
**Requisition:** requester (server identity), department/cost center, budget line, purpose, required date, delivery site, line items, quantity/UOM, specifications, estimated price, urgency, attachments.  
**Approval:** budget availability, threshold, approver matrix, conflict-of-interest declaration, decision/reason.  
**RFQ/quotes:** invited vendors, scope/specification, response deadline, quote line price/tax/shipping, delivery time, warranty, terms, evaluation score, comparison and selection rationale.  
**PO:** supplier, requisition/quote, PO lines, delivery terms, tax, shipping, total, expected date, approval, change order.  
**Receipt/invoice:** received/accepted/rejected quantities, condition, inspection, evidence, supplier invoice, 3-way match (PO/receipt/invoice), discrepancy, return/debit note, payment handoff.  
**Controls:** no self-approval; enforce budget/approval thresholds and audit; public procurement rules only when the relevant entity/funding makes them applicable.

### 07. Inventory & Fixed Assets
**Item master:** SKU, name/specification, category, UOM/conversion, barcode/QR, serial/lot tracking, expiry tracking, reorder point, valuation method, tax/account mapping, active status.  
**Warehouse:** code/name, address, zone/bin, manager, capacity, status.  
**Stock transaction:** receipt/issue/adjustment/transfer/return, source document, item, lot/serial, from/to location, quantity, unit cost, reason, date, recorder, approver, evidence, idempotency key.  
**Stocktake:** count session, scope, counters, blind count, book quantity, physical quantity, variance, explanation, approval, adjustment posting.  
**Fixed asset:** asset code, category/class, acquisition source/date/cost, tax/book basis, useful life, residual value, depreciation method/start, location, custodian, serial, warranty, insurance, funding/source, status.  
**Asset lifecycle:** capitalize, assign, transfer, maintain, impair, depreciate, audit, dispose/sell/donate, approval, proceeds, evidence.  
**Controls:** append-only movement ledger; never edit balances directly; serial/lot uniqueness, negative-stock policy, valuation and depreciation policy approved by accounting.

### 08. People, HR & Payroll
**Employee master:** employee number, legal/preferred name, identity data with restricted encryption, date/place of birth, address/contact, emergency contact, employment type/status, hire/termination dates, work location, department, job/grade, manager.  
**Employment documents:** PKWT/PKWTT or applicable agreement type, signed contract, role, work location, start/end, probation if lawful/applicable, wage components, work hours, leave, confidentiality/IP, amendments, termination basis/evidence.  
**Statutory/tax profile:** NPWP/NIK tax identifier, PTKP status, tax category, BPJS Kesehatan and Ketenagakerjaan membership/programs, family/dependent data only as required, bank account encrypted, effective dates.  
**Time & leave:** shift/calendar, attendance source, check-in/out, correction reason, leave type/balance, start/end, attachment, approver, overtime request/approval and hours.  
**Payroll:** period, employees included, salary components, allowances, overtime, THR, deductions, PPh 21 calculation method/version, BPJS contributions, gross/tax/deductions/net, calculation snapshot, maker/checker, approval, payment batch, payslip and tax evidence.  
**Controls:** effective-dated tax and wage rules; do not hard-code a tax rate or minimum wage; separate employee/contractor/volunteer/teacher categories by actual legal relationship; strict role access to identity, tax, bank, health, and payroll data.

### 09a. Support, Incident & SLA
**Ticket intake:** customer/site/installation, reporter/contact, channel, subject, description, category, affected module/version, environment, impact, urgency, severity, attachments with secret/PII scrubbing.  
**Service handling:** priority, SLA policy/version, response/resolve targets, owner/team, acknowledgement, escalation, status, customer updates, related incident/problem/change, workaround, root cause, resolution, downtime, closure confirmation, reopen reason.  
**Incident:** detection time, impact/scope, severity, affected services/sites, incident commander, timeline, containment, recovery, root cause, corrective/preventive action, postmortem, evidence.  
**Controls:** SLA clock pauses only under defined policy; immutable status events; avoid collecting unnecessary student/health data in support tickets.

### 09b. Warranty & Repair
**Claim intake:** customer, installation/product, serial/asset, contract/warranty agreement, purchase/activation date, issue date, symptom, impact, evidence, reporter.  
**Eligibility:** warranty period, coverage type/scope, exclusions, previous repair, tamper/abuse assessment, eligibility decision/reason, reviewer.  
**Repair work order:** assigned technician, diagnosis, steps, parts used, labour/time, before/after evidence, downtime, billable flag/cost, customer-visible summary, approvals.  
**Closure:** repair status, test result, customer acceptance, warranty balance, invoice/service event link, event history, recurrence.  
**Controls:** warranty terms snapshot; claim decision and repair events auditable; approval before chargeable work.

### 10. Company Operations
**Organization:** legal entity, department hierarchy, cost center, manager, delegated authority, effective dates.  
**Internal policy:** policy/SOP number, owner, version, effective date, acknowledgement requirement, audience, review date, superseded version.  
**Budget:** fiscal year/period, department, cost center, category, allocated/revised amount, funding source, approval, commitments/actuals.  
**Expense claim:** employee, expense date/category, business purpose, merchant, amount/currency, tax, receipt, cost center/project, payment method, approver, reimbursement state.  
**Company asset:** asset master, custodian, assignment/return, maintenance, disposal, evidence.  
**Controls:** approval thresholds, no self-approval, receipt evidence, audit and segregation of duties.

### 11. Documents & Archive
**Document metadata:** document number/type/title, owner, classification, related entity/resource, source, issue/effective/expiry dates, version, language, retention class/until, legal hold, access policy.  
**File intake:** file, MIME/signature, size, checksum, malware scan, uploader, storage provider/reference, encryption key reference, scan result.  
**Workflow:** draft/review/approved/signed/published/archived/disposed; reviewer, signer, signature provider/reference, version comparison, supersedes.  
**Archive controls:** retention trigger, legal hold reason, access log, export request, disposition schedule, approval, destruction certificate, preservation format.  
**Controls:** private object storage; signed short-lived download URLs; no public bucket; malware scanning; immutable access audit; retention based on record class and legal basis, not one global expiry.

### 12a. Client Installations
**Customer/site:** customer, branch/site, installation code/name, deployment mode (cloud/hybrid/offline), environment, region, operator contact.  
**Enrollment:** device identity, certificate/public-key reference, application/connector version, signed enrollment request, approved-by, enrolled/revoked dates, installation health.  
**Telemetry:** categories, purpose, data minimization, PII redaction profile, retention, heartbeat interval, alert thresholds, customer notice/consent where applicable.  
**Remote operations:** maintenance window/timezone, customer approval, operator, session purpose, safety class, signed job, scope, expiry, idempotency, result, rollback.  
**Release/sync:** package signature, version, staged rollout, canary, rollback target, offline outbox, sequence number, conflict and reconciliation record.

### 12b. Backup & Disaster Recovery
**Policy:** installation, scope (DB/files/config/keys metadata), frequency, schedule/timezone, retention, destination type/reference, encryption, checksum, offsite/immutable copy, RPO, RTO, owner, approval.  
**Run:** trigger, start/end, status, bytes, checksum algorithm/value, consistency check, redacted failure code, verification status.  
**Restore drill:** restore point, isolated target, requester/approver, start/end, validation checklist, RTO measured, data-integrity result, application smoke test, evidence, sign-off.  
**Controls:** backup success is not restore success; prohibit production overwrite in a restore test; secrets are references only, never stored in form text.

### 13. Agent Operations
**Agent registry:** key/name, owner, purpose, model/provider/version, tools/capabilities, allowed data classifications, tenant/customer scope, policy version.  
**Autonomy policy:** observe / reversible allowlisted / approval required / destructive-never-autonomous; allowed actions, denied actions, human approver, two-person rule, kill switch.  
**Run request:** trigger, scope, task, context reference, budget, token/cost ceiling, timeout, retry, idempotency, expected output, due date.  
**Evaluation:** prompt/model release, test set, quality/safety score, false positive/negative, data leakage checks, reviewer, rollout approval.  
**Execution result:** status, redacted summary, findings, proposed action, evidence, approver, dispatch state, rollback, incident link.  
**Controls:** no arbitrary shell/SQL/remote command; no secret values in prompts/logs; least privilege, tenant isolation, human approval for changes, immutable run ledger.

### 14a. Security & Audit
**Access governance:** user identity, role, permission set, tenant/site scope, MFA status, session/device, granted-by, reason, start/end, last review, revoke.  
**Audit search:** actor, action, resource, tenant, time range, request/correlation ID, outcome, sensitive-field redaction, export reason.  
**Security incident:** incident ID, discovery time, affected systems/data, severity, reporter, containment, evidence, notification decision/deadline, remediation, post-incident review.  
**Privacy operations:** processing inventory, controller/processor role, lawful basis, purpose, data categories, recipients/subprocessors, retention, cross-border transfer, data-subject request, DPIA, DPO/contact, breach response.  
**Controls:** platform-wide MFA policy, access reviews, break-glass workflow, secret rotation metadata, vulnerability tracking, 3×24-hour PDP breach notification workflow when legally triggered; preserve evidence and avoid exposing secrets in audit metadata.

### 14b. Regulations & Compliance
**Regulation register:** instrument type/number/year, title, issuing authority, official URL, promulgation/effective date, status, amended/repealed-by links, last verified date, reviewer.  
**Applicability:** legal entity/customer type, institution pathway, product/domain, geography, activity, conditional trigger, applicable/not applicable/pending legal review, rationale.  
**Obligation/control:** obligation ID, source article/paragraph, plain-language requirement, control owner, frequency, due date, evidence type, evidence reference, review outcome, gap/risk, remediation, target date.  
**Monitoring:** source update, amendment impact assessment, affected forms/fields/workflows, release ticket, legal review and approval.  
**Controls:** cite exact article/paragraph and version; no blanket claim of compliance; no rule should be marked mandatory for all tenants if it only applies to a specific entity or activity.

### 14c. Publisher & Integrations
**Publisher:** legal/person identity, organization, verified contact, authority, agreement, status, grant/revoke reason, review date.  
**Package:** module key, version, manifest, digest/signature, publisher, dependencies, permissions, data classifications, migration declarations, compatibility, release notes, SBOM/license evidence, security scan.  
**Integration:** provider, API base, OAuth/client registration reference, scopes, webhook URL, signing secret reference, event subscriptions, rate limits, data fields, purpose, data residency, subprocessor/DPA.  
**Lifecycle:** sandbox, conformance tests, security review, approval, staged enablement, health monitoring, version update, key rotation, incident disable/revoke.  
**Controls:** never store secret values in the UI/database as plain text; use managed secret references and least-scope credentials.

## 5. Indonesian legal and regulatory applicability map

The application must keep **platform operator obligations** separate from **customer pesantren/school obligations**. A customer can be a pesantren, foundation, school, cooperative, company, or another entity. Requirements must be conditional.

### Platform operator / SaaS provider
- **PSE Lingkup Privat:** PP 71/2019 and Permenkominfo 5/2020 as amended by Permenkominfo 10/2021 are the relevant private electronic-system registration framework. Assess whether the PONDOK OS service falls within registration criteria and maintain registration/status/evidence in Governance. Do not confuse this with PSE Lingkup Publik. Official Komdigi FAQ: https://pse.komdigi.go.id/pertanyaan-umum and JDIH: https://jdih.komdigi.go.id/produk_hukum/view/id/759. 
- **ITE and electronic evidence:** UU 11/2008 as amended, most recently by UU 1/2024; relevant for electronic systems, transactions, evidence and electronic signatures. https://peraturan.bpk.go.id/Details/274494/
- **Personal data:** UU 27/2022. Record processing purpose and lawful basis, controller/processor role, notice, data-subject rights, retention, security, processor/subprocessor instructions, DPIA for high-risk processing, DPO where statutory criteria are met, and breach response. A qualifying breach requires written notice within 3×24 hours. Official text: https://jdih.komdigi.go.id/produk_hukum/view/id/832. The platform provider's role may differ by processing purpose; determine it contractually and operationally, not by assumption.
- **Corporate legal identity:** UU 40/2007 as amended by UU 6/2023 for PT; UU 16/2001 as amended by UU 28/2004 for foundations; UU 25/1992 and amendments for cooperatives. Do not force PT-only fields onto foundations/cooperatives. https://peraturan.bpk.go.id/Details/39965 and https://peraturan.bpk.go.id/Home/Download/33256/UU%20Nomor%2016%20Tahun%202001.pdf.
- **Tax and invoicing:** UU 7/2021 as amended, PMK 131/2024 for VAT treatment, and PMK 81/2024 as amended (including PMK 1/2026) for Coretax administration. PPh 21 uses PP 58/2023 and PMK 168/2023, with any 2025/2026 incentives conditional and effective-dated. Tax calculation must be configured by tax status, transaction, product/service, and period; do not hard-code one VAT treatment or assume every provider is PKP. https://peraturan.bpk.go.id/Details/185162, https://peraturan.bpk.go.id/Details/311485/pmk-no-131-tahun-2024, https://peraturan.bpk.go.id/Details/306614/pmk-no-81-, https://jdih.kemenkeu.go.id/dok/6f5925c3-ad3a-462b-f7be-08dc0da71246.
- **Archives and records:** UU 43/2009 and PP 28/2012 provide the archival framework. Retention and disposition must be mapped to record class, entity and applicable rules; not all private-sector business records have the same retention schedule. https://peraturan.bpk.go.id/Details/5240/pp-no-28-tahun-2012.

### Employer / payroll (only where the customer or platform entity is an employer)
- **Employment and wages:** UU 13/2003 as amended by UU 6/2023 and implementing rules including PP 36/2021 as amended by PP 51/2023 and PP 49/2025. Store employment relationship, effective-dated wage components, local minimum-wage context, hours, overtime and payment evidence. https://peraturan.bpk.go.id/Details/161909/pp-no-36-tahun-2021 and https://peraturan.bpk.go.id/Details/339037.
- **PPh 21:** PP 58/2023 and PMK 168/2023; support employee/non-employee and relevant income categories, TER/monthly and annual reconciliation, withholding evidence, and effective tax rules. https://jdih.kemenkeu.go.id/dok/pmk-168-tahun-2023/summary.
- **BPJS:** UU 24/2011, Perpres 82/2018 as amended by Perpres 59/2024, and applicable BPJS employment regulations. Track employer/worker registration and contribution basis/programs. https://peraturan.bpk.go.id/Details/39268/uu-no-24-tahun-2011 and https://peraturan.bpk.go.id/details/285181/perpres-no-59-tahun-2024.
- **THR:** Permenaker 6/2016, subject to current amendments/official guidance; calculate by employment relationship and service period, not as a generic fixed allowance. https://peraturan.bpk.go.id/Download/252116/Kemnaker%20No.%206%20Tahun%202016.pdf.

### Customer institution / pesantren / school (conditional)
- **Pesantren:** UU 18/2019; PP 55/2007; PMA 30/2020 and PMA 31/2020; PMA 32/2020 where Ma'had Aly applies; Perpres 82/2021 for pesantren funding. Registration/NSP and Kemenag/EMIS fields must be applicable to the institution's actual pathway and verified against Kemenag sources.
- **Education under Kemendikdasmen:** UU 20/2003, PP 57/2021 as amended by PP 4/2022, and currently applicable standards/technical rules. Dapodik fields and integrations require current official specifications and authorization; do not claim integration merely because a field exists.
- **Child protection/safeguarding:** UU 23/2002 as amended, including UU 35/2014 and later amendments; UU 12/2022 for sexual-violence prevention/response. Sensitive complaint records require restricted access, safe reporting, survivor-centred handling and audit.
- **Health data:** UU 17/2023 and PP 28/2024; health data is sensitive personal data under UU PDP. Do not create diagnosis or clinical decision features outside proper professional authority.
- **Cooperative unit:** cooperative-specific identity, members, governance, RAT, books and reports only when the unit is legally a cooperative; do not treat every pesantren shop as a cooperative.
- **Public procurement:** apply public procurement rules only when the legal entity/funding/transaction makes them applicable; a private pesantren or private company does not automatically fall under the full APBN/APBD procurement regime.

**Legal quality gate:** every legal reference in a field schema must carry article/paragraph, instrument version, effective date, applicability condition, official source URL and last-verified date. A legal reviewer must approve it. This document is an engineering specification, not a legal opinion or certification.

## 6. Shared form and API contract for all menus

Every write-capable module must implement:
1. A domain-specific form schema (not a universal generic CRUD form), labels/help text in Indonesian, conditional sections, required/optional/conditional field state, lookup sources, and field-level classification.
2. Client validation **and** authoritative server validation; database constraints for invariants; server derives actor, organization/customer scope and audit identity from the verified session, never from browser-supplied actor IDs.
3. Explicit state machine and allowed transitions; maker/checker for financial, legal, security, HR and entitlement changes; no self-approval where separation is required.
4. Transactional writes with idempotency for retries, optimistic concurrency/version checks, unique keys, foreign keys and immutable event/audit history.
5. RLS + API authorization tests for every role and tenant. The global Super Admin control plane is separately scoped and must not gain implicit tenant operational access.
6. Audit metadata that records actor, action, resource, before/after field names or safe diffs, timestamp, request/correlation ID and decision reason; never log raw secrets, full identity numbers, bank accounts, health details or uploaded document contents.
7. Attachment controls: private storage, malware scanning, MIME/signature verification, size limits, checksum, encryption, versioning, access audit, retention and deletion/legal hold.
8. Empty/error/loading states that explain the cause; a failed API must not render an empty list as if no records exist.
9. Unit, API, integration, UI, accessibility and two-tenant isolation tests; staging UAT by role; backup/restore and incident drill for critical modules.
10. A clear module status: `planned`, `read_only`, `form_available`, `workflow_partial`, `uat_passed`, `production_approved`. Do not label a viewer "live operational".

## 7. Prioritized delivery sequence

**P0 — correctness and observability**
- Correct stale migration/status metadata.
- Display each domain as read-only until actual transaction forms are shipped.
- Add a module readiness matrix (UI/API/schema/permissions/RLS/audit/tests/UAT/deployment) and endpoint health/error state.
- Correct the Module Entitlements navigation mismatch.

**P1 — Commercial control plane vertical slice**
- Complete Customer/Branch Registry → Catalog/Packages → Quote → Contract → Subscription → Entitlement → Activation → Invoice/Payment → Renewal/Termination.
- Add audit events and approval boundaries at every transition.

**P2 — Company operations vertical slice**
- Procurement → receiving → inventory/asset → vendor invoice/payment.
- HR employee/contract → attendance/leave → payroll calculation → approval/payment/payslip.
- Documents private storage and retention lifecycle.

**P3 — Customer service and fleet**
- Ticket/SLA/incident → warranty claim → repair → billable service/invoice.
- Installation enrollment → telemetry → backup executor → restore drill → signed release/rollback.

**P4 — Governance and AI**
- Compliance obligations/evidence and security incident/DPIA workflows.
- Agent registry, scoped tools, policy approvals, evaluation and human-supervised execution. Runtime remains disabled until safety tests pass.

**P5 — executive analytics and go-live**
- Trusted KPI definitions, cross-domain drilldowns, saved/scheduled reports, role-based dashboards, operational acceptance, customer pilot and formal go-live approval.

## 8. Live Development evidence snapshot

- Migration ledger: 26 rows; latest `0026`.
- Platform schema: 80 base tables; 79 with RLS enabled and FORCE; one exception `platform.super_admins` (global platform control table).
- Active Super Admin count: 1 (count only; no identity disclosed).
- Sampled business data tables are empty in Development; audit events count was 1 at the time of this read-only audit.
- The Development environment has no seeded customer/demo business data. Do not use empty tables as proof of full workflow correctness.
- No SQL write, migration, secret update, Production query, or Production deployment was performed for this audit.

## 9. Source links checked for this specification

- UU PDP 27/2022 — https://jdih.komdigi.go.id/produk_hukum/view/id/832
- PP 71/2019 / PSE private FAQ — https://pse.komdigi.go.id/pertanyaan-umum
- Permenkominfo 5/2020 — https://jdih.komdigi.go.id/produk_hukum/view/id/759
- UU ITE 1/2024 — https://peraturan.bpk.go.id/Details/274494/
- UU 40/2007 PT — https://peraturan.bpk.go.id/Details/39965
- UU 16/2001 Yayasan — https://peraturan.bpk.go.id/Home/Download/33256/UU%20Nomor%2016%20Tahun%202001.pdf
- UU 7/2021 HPP — https://peraturan.bpk.go.id/Details/185162
- PMK 131/2024 PPN — https://peraturan.bpk.go.id/Details/311485/pmk-no-131-tahun-2024
- PMK 81/2024 Coretax, amended — https://peraturan.bpk.go.id/Details/306614/pmk-no-81-
- PMK 168/2023 PPh 21 — https://jdih.kemenkeu.go.id/dok/pmk-168-tahun-2023/summary
- PP 49/2025 wages — https://peraturan.bpk.go.id/Details/339037
- UU 24/2011 BPJS — https://peraturan.bpk.go.id/Details/39268/uu-no-24-tahun-2011
- Perpres 59/2024 JKN — https://peraturan.bpk.go.id/details/285181/perpres-no-59-tahun-2024
- UU 43/2009 / PP 28/2012 Archives — https://peraturan.bpk.go.id/Details/5240/pp-no-28-tahun-2012
