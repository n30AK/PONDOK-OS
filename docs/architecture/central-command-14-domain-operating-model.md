# Central Command — 14 Domain ERP Operating Model

This document is the product scope baseline for Central Command. All 14 domains are first-class workspaces. A visible navigation item is not evidence that its business workflow is operational. Each domain must progress through schema, API, UI, authorization, audit, tests, and production-readiness gates.

## 1. Executive Dashboard
- KPI, revenue, customer counts, cash flow, receivables, expenses, sales performance.
- Fleet uptime, security posture, backup status, incidents, SLA breaches, business risks.
- Executive reports with period filters, drill-down to source records, and export.
- Metrics must be derived from posted/verified records; no fabricated figures.

## 2. CRM & Sales
- Leads, prospects, customer contacts, lead source and qualification.
- Sales pipeline/stages, opportunities, activities, follow-ups and reminders.
- Quotes, proposals, discounts, commissions and approval.
- Customer 360 timeline with communications, contracts, invoices, support and fleet context.

## 3. Customer Management
- Customer legal identity, billing and service contacts, branches and installations.
- Contracts, service packages, trials, subscriptions, renewals, suspension and termination.
- Module catalogue, module versions, entitlements, compatibility, add-ons and change history.
- Explicit customer consent/approval for billable additions and service changes.

## 4. Billing & Invoice
- Invoice numbering, tax configuration, recurring billing, receipts and credit notes.
- Payment receipts, allocations, refunds, receivables aging and reminders.
- Invoice source links: module orders, subscriptions, maintenance agreements, repair work and approved procurement chargebacks.
- Idempotent issuance and posting; immutable issued invoice snapshots and controlled reversal.

## 5. Accounting & Finance
- Chart of Accounts, journal entries, general ledger, trial balance.
- Balance sheet, profit and loss, cash flow, budgets and variance.
- Bank reconciliation, period close, opening balances, accruals and adjusting/reversal journals.
- Double-entry enforcement, segregation of duties, locked periods and complete audit trail.

## 6. Procurement
- Vendor master, purchase requisitions and budget reservation/approval.
- RFQ, vendor quotations, comparison matrix, purchase orders and amendments.
- Goods/service receipt, quality checks, three-way match (PO, receipt, invoice), vendor bills and payment.
- Conflict-of-interest declarations, approval thresholds and vendor performance.

## 7. Inventory & Asset
- Warehouses, bins, stock ledger, transfers, receipts, issues and stock counts.
- Barcode/QR, serial numbers, lots/batches, expiry and traceability where applicable.
- Fixed asset register, capitalization, depreciation, impairment, maintenance and disposal.
- Reconciliation of inventory valuation and asset depreciation to the general ledger.

## 8. HRD & Payroll
- Employee master, organization chart, departments, positions and employment contracts.
- Recruitment, onboarding/offboarding, attendance, shifts, leave, overtime and performance.
- Payroll periods, components, BPJS, PPh 21, approvals, payslips and payroll journals.
- Sensitive HR/payroll data isolation, restricted roles, encryption and access logging.

## 9. Support & Customer Success
- Customer tickets, categories, priorities, SLA timers, escalation and assignment.
- Knowledge base, incident/problem/change records, root-cause analysis and post-incident review.
- Customer satisfaction, service reviews, renewal risk and customer success plans.
- Warranty claims, repair work orders, evidence, downtime and customer-facing repair history.

## 10. Internal Operations
- Internal employees, departments, policies and acknowledgements.
- Internal budgets, expense claims, reimbursements, approvals and cost centers.
- Company asset assignment, maintenance, administration and operating calendar.
- Internal controls and separation from customer-facing records.

## 11. Document Center
- Invoice PDFs, contracts, proposals, purchase orders, receipts, payslips and audit packs.
- Document metadata, versioning, checksum, access classification and signed/expiring links.
- Retention schedules, legal hold, secure archive, export and access audit.
- Object storage must be private by default; never expose raw storage credentials.

## 12. Fleet Management
- Client installations, devices, application versions, connectors and deployment rings.
- Enrollment, heartbeat, redacted logs, health checks, security findings and incidents.
- Signed updates, staged rollout, rollback, remote support and offline synchronization.
- Outbound-only site agent, device-bound identity, replay protection and allowlisted tasks.

## 13. Multi-Agent AI
- Orchestrator and specialist agents for monitoring, security, diagnosis, backup, updates and analytics.
- Deterministic checks before AI classification; evidence-backed recommendations.
- Policy-bound task manifests, approvals, budgets, rate limits, audit and idempotency.
- AI must not self-approve, bypass authorization, invent task types or run arbitrary shell/SQL.

## 14. Governance & Compliance
- RBAC/ABAC, MFA, privileged access, tenant isolation and approval matrix.
- Audit trails, data classification, encryption, retention, residency and privacy workflows.
- Security controls, vulnerability management, incident response, backup/DR and continuity tests.
- Regulatory library with source, jurisdiction, effective date, status and verified amendment history.

## Cross-domain invariants
1. One customer identity links CRM, contracts, subscriptions, invoices, support, warranties and fleet installations.
2. Every chargeable event has a source record, customer approval where required, price snapshot, invoice line and accounting posting.
3. Payments are allocated to invoices; journal postings are balanced, idempotent and reversible only through controlled entries.
4. Every client installation has ownership, lifecycle state, entitlement, version, health, backup evidence and support history.
5. Warranty/repair records distinguish covered work from billable work and expose a customer-safe report separate from internal notes.
6. Reports are generated from authorized source records and include period, filters, provenance and generation timestamp.
7. Sensitive HR, payroll, finance and tenant data use least-privilege access and auditable reads/writes.
8. No module is labelled operational until schema migration, authenticated API, UI workflow, authorization, audit and automated tests pass in Development.

## Implementation status at this baseline
- Existing foundations in migrations 0020–0023 cover portions of CRM/customer/catalog/contracts/subscriptions, invoices/payments, support, installation/fleet, agent/security records, module entitlements, backup/observability/maintenance, warranty/repair timelines, and double-entry ledger.
- Procurement, inventory/fixed assets, HRD/payroll, internal operations and document service still require dedicated schemas and workflows.
- Executive dashboards, CRM, billing, accounting, support, fleet, warranty and agent runtime still require end-to-end API/UI integration beyond their data foundations.
- Do not claim a domain is live solely because its menu or tables exist.
- All development work targets Neon Development only. Production is not modified without explicit authorization.
