# Central Command operational forms — implementation slice (2026-11-08)

## Scope

This change replaces read-only-only interaction for operational workspaces with domain-specific intake forms backed by audited Development API writes. It does not claim every downstream business workflow is complete.

## Supported create forms

| Workspace | Form keys | Resulting state / safety boundary |
|---|---|---|
| Procurement | vendors, requisitions, rfqs, purchaseOrders | Draft records; no vendor dispatch or payment |
| Inventory & Assets | warehouses, assets, transfers | Warehouse active; assets and transfers draft; no stock ledger mutation |
| HRD & Payroll | departments, employees, leave, payrollPeriods | Employee draft; leave submitted; payroll period draft; no payroll calculation/release |
| Internal Operations | budgets, expenses | Draft only; no approval or reimbursement |
| Documents | registry | Metadata only; no binary upload or signed download |
| Support & Incidents | cases, incidents | Ticket open; incident detected; no auto-resolution |
| Fleet | installations | pending_enrollment; no enrollment credential or remote access |
| Backup | policies | Disabled by default; encryption/checksum required; no executor or restore |
| Warranty | claims | Submitted; no eligibility decision or repair assignment |
| Agent Operations | remoteJobs | pending_approval; no dispatch or execution |

## API contract

POST /v1/platform/erp/operations/{domain}/{dataset}

Request body: { values: { field_name: value } }

The server resolves domain and dataset through a static allowlist; rejects unknown fields, missing required fields, oversized payloads, and malformed values; re-checks active Super Admin status inside the transaction; sets app.user_id and switches to pondok_platform_runtime; applies server-owned actor fields and fixed initial statuses; writes the record and audit event in the same transaction; and returns safe errors without exposing SQL/database internals.

## Lookup data

Existing live datasets are supplemented with limited lookup lists for customers, installations, warranty agreements, employees, and departments where forms require foreign keys. The UI uses IDs as select values and human-readable labels.

## Explicitly not implemented by this slice

- Multi-line purchase requisition/RFQ/PO editors, vendor quote comparison, receiving, and 3-way match.
- Stock movement posting, stocktake, valuation, asset depreciation posting, transfer dispatch/receipt.
- Employee private identity/tax/bank data entry, assignment lifecycle, attendance corrections, payroll computation, tax/BPJS calculations, payslip, payroll approval/payment.
- Expense approval and reimbursement.
- Private object storage upload/download, malware scanning, versioned binary retention, legal hold, disposition.
- SLA timers/escalation/communications automation and incident resolution.
- Installation enrollment credentials, connector handshake, remote session, telemetry activation.
- Backup execution, immutable/offsite verification, restore execution and restore testing.
- Warranty eligibility decision, repair assignment, parts, cost approval and customer acceptance.
- Agent runtime, autonomous dispatch, and execution. Remote job records remain pending approval.

## Database and environment safety

- No migration is added; this slice uses the existing Development schema.
- No production branch, production data, production secret, or production deployment is modified.
- No sample records are inserted into the shared Development database.
- A successful build does not establish business workflow completion. Each write path still requires authenticated end-to-end UAT and negative authorization tests before operational rollout.


## Additional validation notes

- Foreign-key lookup datasets are marked as lookup-only and are not duplicated in the operational record tables.
- Support ticket customer/installation references and warranty claim customer/installation/agreement references are checked for consistency server-side.
- Warranty claims require an active warranty agreement. Agent task payloads accept only a small allowlist of diagnostic parameters; requests expire and remain pending approval.
- Report-only workspaces continue to advertise read-only capability; write capability is reported per domain rather than globally.
