# Central Command — ERP, CRM, Multi-Agent & Fleet Operations

Status: target architecture and delivery contract. This document does not claim unimplemented workflows are live.

## 1. Product boundary

Central Command is the platform operator's business workspace and technical control plane. It has three strictly separated data areas:

1. Platform business plane: PONDOK OS operator data — prospects, customers, contracts, plans, subscriptions, billing, invoices, receipts, support, internal staff, payroll, accounting, procurement, assets and consolidated reports.
2. Fleet control plane: registered installations — site/device registry, connector health, versions, module entitlements, telemetry, security findings, maintenance jobs, signed releases and remote support.
3. Tenant operational plane: each institution's own student, guardian, health, academic, boarding, finance and employee data. Central Command must not silently become a cross-tenant browser for sensitive institutional records.

Telemetry is minimized. Never send student records, medical data, passwords, session tokens, raw secrets or unnecessary personal data to the platform control plane.

## 2. ERP and CRM catalogue

### A. Executive workspace
- KPI dashboard: active customers, trials, conversions, recurring revenue where applicable, receivables aging, overdue invoices, cash/bank position, revenue, expenses, margin, churn, renewals, support SLA, fleet uptime, deployment failures, security incidents and release adoption.
- Drill-down by period, product, customer, plan, region, sales owner and legal entity.
- Saved filters, export queue, scheduled reports, alert thresholds and reconciliation status.
- Every KPI displays source, period, last refresh and provisional/reconciled status.

### B. CRM and sales
- Lead capture, source attribution, duplicate detection, consent/preferences and account/contact hierarchy.
- Pipeline: new, qualified, discovery, demo, proposal, negotiation, won, lost, dormant.
- Calls, meetings, tasks, follow-ups, notes, attachments and interaction history.
- Product/edition catalogue, price books, discounts, quotes, proposals and approval limits.
- Forecast, win/loss reasons, sales targets, commission rules and onboarding handoff.
- Customer 360: contacts, contracts, sites, licenses, installed versions, tickets, invoices, payment history, renewal date and permitted telemetry.

### C. Customer, contract and subscription
- Legal identity, tax identity, billing/shipping addresses, PIC and branch/site hierarchy.
- Contracts, addenda, terms, renewal, termination, SLA, support entitlement and document version history.
- Plans, feature entitlements, module bundles, seat/site/device limits, trial, grace period, suspension and reactivation.
- Immutable subscription lifecycle history; no silent entitlement changes.
- Usage metering only for explicitly defined metrics. Rp0/free-first mode must not depend on paid AI providers or hidden usage charges.

### D. Billing, invoice and collection
- Quote → order → contract → invoice lifecycle; recurring and one-off invoices.
- Numbering series per legal entity/fiscal year; line items, taxes, discounts, due date, currency, payment reference, PDF rendition and delivery log.
- Credit/debit notes, refunds, receipts, partial payments, allocations, deposits, write-off approvals, dunning and collection tasks.
- Receivable aging: current, 1–30, 31–60, 61–90 and over 90 days; customer statements and tax summaries.
- Optional payment gateway/bank adapters plus manual bank reconciliation.
- An invoice is never marked paid from AI inference or an unverified webhook.

### E. Accounting and finance
- Configurable chart of accounts, legal entity, fiscal periods, cost centers, projects, departments, dimensions and opening balances.
- Double-entry journal with balanced debit/credit validation and draft → review → posted → reversed lifecycle. Posted journals are immutable; corrections use reversal.
- General ledger, subledger, trial balance, balance sheet, profit/loss, cash flow, equity changes, budget vs actual, cash/bank book.
- Accounts receivable/payable, prepayments, accruals, fixed assets, depreciation, inventory valuation and bank reconciliation.
- Budgeting, cash forecast, expense claims, reimbursements, petty cash, approval matrix and segregation of duties.
- Indonesian PPN/PPh treatment is configurable and versioned, reviewed by qualified finance/tax staff; never hard-code a legal tax opinion.
- Period close checklist, lock/reopen with explicit approval, evidence and reconciliation exceptions.
- Financial statements derive from posted and reconciled ledgers, not dashboard estimates.

### F. Procurement and vendors
- Vendor onboarding, tax identity, restricted bank details, contracts and performance.
- Purchase request → budget check → approval → RFQ → quotation comparison → PO → receipt → supplier invoice → payment.
- Three-way match (PO, receipt, invoice), partial receipts, returns, vendor scorecard and spend analytics.
- Approval thresholds and immutable change log.

### G. Inventory, warehouse and assets
- Multi-warehouse, SKU, UOM, categories, serial/lot/batch, expiry, min/max and reorder point.
- Goods receipt, issue, transfer, adjustment, count, return, reservation, stock card and valuation.
- Fixed assets: acquisition, custodian, location, depreciation, maintenance, impairment, transfer and disposal.
- QR/barcode and mobile stock-taking.
- Inventory valuation reconciles to accounting ledger.

### H. HRD and payroll
- Employee master, contracts, organization chart, positions, grades, locations, documents, competencies, training and certifications.
- Recruitment, onboarding, probation, attendance, shifts, leave, overtime, travel, performance, disciplinary workflow and offboarding.
- Salary components, allowances, deductions, overtime, BPJS and tax calculation adapters, payslips, payroll journal and bank transfer file.
- Payroll: prepare → validate → approve → lock → pay → post; maker-checker and compensation access restrictions.
- Employment, BPJS, PPh 21 and minimum-wage settings are configurable/versioned and reviewed by competent staff. AI may flag anomalies but cannot approve or release payroll.

### I. Support and customer success
- Tickets, severity, category, tenant/site, affected version/module, SLA clock, assignment, escalation, knowledge base, resolution and satisfaction.
- Incident/problem/change management, root-cause analysis, workaround, permanent fix and post-incident review.
- Customer success plans, adoption, renewal risk, onboarding and training history.
- Remote support requires a time-limited customer-authorized session with named operator, purpose, scope and audit.

### J. Internal organization
- Platform staff directory, roles, departments, work queue, approvals, internal policies, timesheets and internal HR/payroll.
- Platform legal entities, branches, bank/cash accounts, vendors, budgets and internal assets.
- Internal records remain separate from customer institution records.

### K. Reports and document center
- Sales funnel, cohorts, renewals, churn, recurring revenue, invoice aging, collections, cashflow, P&L, balance sheet, trial balance, budget variance, procurement spend, stock valuation, depreciation, headcount, payroll register, attendance, ticket SLA, uptime, security posture, deployment adoption and agent effectiveness.
- PDF/XLSX/CSV export with permission checks, watermarking for sensitive exports, export audit and retention.
- Invoice, quote, contract, PO, receipt, payslip, journal voucher, customer statement, reconciliation evidence and audit package templates.

## 3. Multi-agent AI operations

Agents are specialized, policy-constrained workers coordinated by an orchestrator. They do not share unrestricted credentials. Every run records run ID, trigger, scope, model/provider metadata, tool calls, findings, confidence, proposed actions, approvals, result and cost.

| Agent | Responsibilities | Default authority |
|---|---|---|
| Command Orchestrator | Prioritize incidents, delegate, correlate and summarize | Read + delegate |
| Fleet Observer | Heartbeats, versions, service health, queue lag, storage/CPU/error trends | Read-only |
| Security Sentinel | Auth anomalies, privilege changes, suspicious access, integrity and dependency findings | Read + alert; containment by policy |
| Database Guardian | Migration drift, locks, latency, backup/restore evidence and schema health | Read-only |
| Application SRE | Error grouping, regression detection, safe retries/restarts/cache rebuilds | Allowlisted reversible actions |
| Release & Module Steward | Compatibility, manifests, signed releases, staged rollout and rollback readiness | Prepare; deployment gated |
| Backup & Recovery | Backup freshness, restore drill scheduling and recovery evidence | Read-only + approved drill |
| Compliance Librarian | Official-source changes and obligation mapping | Draft findings; legal validation |
| Finance Controller | Reconciliation exceptions, invoice anomalies and ledger variance | Read-only + draft journal/task |
| HR & Payroll Auditor | Payroll outliers, missing approvals and attendance inconsistencies | Read-only; never release payroll |
| CRM & Customer Success | Authorized lead enrichment, follow-up drafts and renewal risk | Draft only; external send approval |
| Report Analyst | Periodic reports, trends and anomaly explanations | Read-only |
| Offline Sync Steward | Outbox status, idempotency, conflict classification and retry proposals | Retry safe idempotent events only |

### Agent operating loop
1. Collect least-privilege, minimized telemetry and signed health events.
2. Correlate signals with release/version/change windows; deduplicate alerts.
3. Classify severity, affected installations, confidence and blast radius.
4. Produce evidence-backed diagnosis and reversible remediation plan.
5. Execute only policy-allowlisted low-risk actions; otherwise request approval.
6. Verify recovery and business invariants; rollback if verification fails.
7. Record before/after evidence, result, cost and audit event; notify operators.

No agent may change roles/RLS, expose tenant data, rotate root secrets, drop tables, rewrite posted ledgers, approve invoices/payroll, delete backups or run unreviewed migrations autonomously.

## 4. Remote fleet operations: cloud and offline

### Cloud-connected installation
- Register each customer site and connector using a one-time enrollment challenge.
- Connector establishes outbound TLS to control plane; do not expose inbound public SSH/RDP.
- Device identity uses revocable certificates/keys stored in OS secret storage.
- Heartbeats contain install/site IDs, release/module versions, OS/runtime version, health summary, queue depth, last backup and timestamp.
- Remote jobs are signed, scoped, short-lived, expiring, idempotent and installation-bound; output is redacted.
- Remote support requires explicit customer grant, named operator, time window, purpose, command allowlist and visible session indicator.
- Updates are signed and verified locally; canary → staged cohort → full rollout with health gate and rollback.
- Database migrations are separate from app releases, preflighted, backed up, tested and approved.

### Offline/self-hosted installation
- Local control service, local administrator, health checks, audit, backup and local workflows continue without cloud.
- Local diagnostics use deterministic rules first; optional local models only if resources permit.
- Events queue in durable local outbox with idempotency keys and ordered sequence.
- On reconnection, signed event batches sync; conflicts are quarantined for deterministic resolution, never silently overwritten.
- Remote commands wait in expiring queue and are rejected if stale on reconnect.
- Signed packages can be imported from removable media with signature, compatibility, backup and rollback checks.
- Show last-seen/telemetry age; never display stale data as live.
- A disconnected installation cannot be remotely controlled until it reconnects. This is a physical/network limitation, not a software setting.

### Remote command safety classes
- Class 0 observe: status, redacted logs, diagnostics and configuration diff.
- Class 1 reversible routine: restart named service, retry idempotent queue item, rebuild known cache and health probe.
- Class 2 controlled change: config update, module upgrade, migration and version change. Requires approval, maintenance window, backup and health gate.
- Class 3 destructive/sensitive: delete data, alter access control, rotate root secrets, restore over current data, payroll/payment or production promotion. Never autonomous; explicit multi-party approval and separate runbook.

## 5. Security and data governance
- Separate platform business, fleet telemetry and tenant operational schemas.
- Server-side platform authorization; never rely on frontend-only role checks.
- RLS/least privilege for tenant relations; platform runtime role is NOLOGIN/NOBYPASSRLS.
- MFA for privileged operators, short sessions, device-bound enrollment, scoped credentials, revocation and rotation.
- Append-only audit for auth, access, exports, approvals, agent runs, remote sessions, deployments and financial posting.
- PII minimization, retention, encryption in transit/at rest, field encryption and secrets redaction.
- Tenant consent, data processing terms, support access boundaries, export/delete workflow and breach response.
- Security incidents track severity, evidence, owner, containment, recovery and postmortem.
- Encrypted, access-controlled, retention-managed backups and tested restore drills.

## 6. Architecture and cost principles
- Reuse this repository, Neon project and Development/Staging/Production branches. No new repository/database is required for initial control-plane expansion.
- Global platform records live under platform; institution records remain in existing tenant domain schemas.
- Reuse Neon Auth, API JWT verification, platform runtime role and audit framework.
- Pages frontend is a client; privileged business operations go through authenticated API routes.
- Deterministic monitoring and jobs before LLM agents. Core security, backup and health monitoring must work without an LLM.
- Free-first baseline: no mandatory paid model, queue, observability or connector. AI features expose provider availability, estimated cost and disable switch.
- Batch telemetry and respect scale-to-zero constraints.

## 7. Delivery plan and acceptance gates

### Phase 0 — foundations
Finalize data boundary/threat model; platform ERP schema; migration tests; platform RLS; audit; permission matrix; module catalogue with planned/foundation/operational/verified status.

### Phase 1 — CRM and customer operations
Lead → qualification → quote → customer → contract → subscription → support case. End-to-end API, authorization, audit and tests.

### Phase 2 — billing and accounting
Invoice → receipt → reconciliation → journal → trial balance. Balanced entries, posting/reversal and period lock verified.

### Phase 3 — procurement, inventory, assets, HR/payroll
PO/receipt/invoice three-way match; stock-to-ledger reconciliation; asset depreciation; payroll maker-checker and locked payslip cycle.

### Phase 4 — fleet and agent operations
Connector enrollment, heartbeats, fleet dashboard, alerts, agent run ledger, safe remediation and support sessions. Test cloud/offline simulation, replay/idempotency, revoked-device denial and redaction.

### Phase 5 — module marketplace and lifecycle
Module SDK/manifest validation, compatibility matrix, sandbox, approval, signed package, tenant opt-in, canary rollout and rollback. Test request → validation → approval → staging → opt-in → health verification → rollback.

### Phase 6 — reporting and hardening
Reports, exports, scheduled summaries, disaster recovery, load/security tests, runbooks and release gate.

A screen alone never means a module is complete. Completion requires database + API + authorization + audit + tests + end-to-end evidence. Production rollout remains separately authorized.
