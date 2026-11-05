# Central Command Module Billing, Warranty and Client Service Operations

## Commercial module lifecycle

Every module change is a commercial and operational event. The flow is:
1. Customer or authorized staff requests add, activation, upgrade, downgrade, renewal, suspension, resume or removal.
2. Central Command resolves the customer, installation, module catalogue item, product/pricing mapping, active contract and any applicable subscription.
3. The request snapshots the agreed price, quantity, tax, currency, billing mode and billing period. Later catalogue price changes must not rewrite historical orders.
4. A commercial approval is recorded when required. Complimentary, trial and contract-included modules carry an explicit reason and contract/promotion reference; they are not silently treated as paid.
5. For billable orders, Finance prepares an invoice and invoice line. The module order stores both IDs and a unique idempotency key. Repeated events cannot create duplicate invoice lines.
6. The invoice is issued under the customer's payment terms. Activation policy may require invoice issuance or verified payment, according to the signed contract. No module is silently activated before its required approval gate.
7. The provisioner applies the approved module change, performs a health check and appends lifecycle evidence. Failed provisioning does not erase the commercial record; it creates a failed event and a controlled refund/credit/retry workflow.
8. Invoice and payment posting creates immutable, balanced double-entry journal entries. Corrections use reversal entries, not edits or deletion.

### Billing modes
- one_time: one-off invoice line for the approved module order.
- recurring: subscription or renewal billing on the contractual interval.
- included: covered by an active contract/subscription; recorded but not separately charged.
- complimentary: free with explicit authorization and reason.
- trial: time-limited trial; conversion requires a new approved billable order.

The system must prevent duplicate billing when a module is included in a bundle, already active under a contract, or invoiced through a recurring subscription. Suspension/removal does not automatically issue refunds; proration, credit notes and cancellation dates follow contract terms and approved accounting treatment.

## Accounting controls
- Central Command owns a double-entry platform ledger: chart of accounts, journal headers and lines, customer/installation/invoice dimensions.
- Deferred database checks ensure posted journal line debits and credits match the journal header and balance.
- Posting keys are unique to prevent duplicate invoice/payment postings.
- Posted entries are immutable to the runtime role. Corrections require a linked reversal.
- Invoice issuance normally debits accounts receivable and credits module/service revenue plus tax payable as applicable.
- Verified payment normally debits cash/bank and credits accounts receivable.
- Revenue recognition, tax handling, deferred revenue for prepaid subscriptions, withholding, credit notes and local statutory reporting follow the approved chart of accounts and Indonesian accounting/tax policy configured by the finance owner. The application must not invent tax rates or journal accounts.

## Warranty lifecycle

A warranty agreement belongs to a customer and installation and records coverage type, dates, service response/resolution targets, explicit scope, exclusions, terms version, signed document reference, approver and approval timestamp. A claim is reviewed against the warranty dates, scope, exclusions and evidence. Outcomes include covered, excluded, expired or needs review. A claim may link to a support case, incident and repair log. Warranty coverage does not automatically make every third-party cost or out-of-scope request free.

## Repair and maintenance history

Each repair log records client, installation, warranty claim, support case and incident links; category, severity, problem, diagnosis, root cause and actions; before/after evidence references, agent/staff/vendor identity and timestamps; downtime, validation results, billable amount, approval and invoice references; and separate client-visible and internal stakeholder summaries.

Repair history is append-only for the application runtime. State changes should be represented by additional repair events so the timeline is auditable. Do not place credentials, raw personal data, or unredacted database dumps in evidence.

## Reporting

Client reports include service history, incidents, response/resolution times, uptime measurement window, warranty claims, completed repairs, backup/restore verification, maintenance delivered, open risks and next actions. Client-facing documents exclude internal notes, other customers' data, security secrets and privileged investigation details.

Internal management/board/auditor reports can add portfolio-wide service cost, recurring revenue, maintenance margin, SLA attainment, warranty exposure, incident recurrence, backlog, risk register, module adoption, invoice aging and collection status. Every report identifies its period, scope, source evidence, generation time, approval and delivery status.

Unknown or missing telemetry is disclosed as unknown, not counted as healthy. Metrics are not service guarantees unless the signed agreement defines them.

## Security and privacy
- Central Command API authorization and FORCE RLS remain mandatory.
- The customer/installations are the reporting boundary; no cross-customer joins are exposed to client users.
- Client and internal report audiences have separate authorization and field-level redaction.
- Commercial approvals, invoice posting, warranty decisions and report delivery are auditable.
- Runtime cannot delete ledger entries, module lifecycle events or repair evidence.
- No production installation is changed by a draft order or an AI recommendation alone.