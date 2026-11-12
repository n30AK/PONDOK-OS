# API runtime

Node.js 22+ HTTP API for PONDOK OS. The current implementation is intentionally dependency-light and does not yet use NestJS.

## Runtime configuration

Authenticated routes require:

- `DATABASE_URL`: PostgreSQL URL for the same environment as Neon Auth.
- `NEON_AUTH_BASE_URL`: exact issuer/base URL from that Neon Auth branch.
- `NEON_AUTH_JWKS_URL`: exact JWKS URL from that same branch.
- `PORT`: optional, defaults to 3001.
- `CORS_ALLOWED_ORIGINS`: comma-separated exact browser origins for deployed clients.

Never commit populated environment files or print database URLs in logs. Never mix Auth URLs and database URLs from different Neon branches.

## Implemented endpoint groups

- `GET /health/live`: process liveness.
- `GET /health/ready`: verifies database connectivity, the transaction-local restricted tenant/platform runtime roles, and RLS policy coverage. It still does not prove schema completeness or business workflow acceptance.
- `GET /v1/tenant/context`: verify Neon JWT, active organization membership, and resolve server-side roles/permissions.
- `/v1/academic/*`: student and academic foundation endpoints.
- `/v1/finance/*`: chart of accounts, fiscal periods and journal workflows.
- `/v1/inventory/*`: item, warehouse and stock movement operations.
- `/v1/hr/*`: employee and payroll period/run workflows.
- `/v1/sync/*`: authenticated device and pending event inbox foundation.
- `/v1/modules/*`: tenant-scoped module resources, including student identity/health and guardian-authority verification routes where their schema and secrets are available.
- `/v1/platform/*`: company Central Command and activation-control routes.

Each protected operation must verify identity, active organization membership or platform Super Admin authority, and the required permission. Tenant-owned queries must include organization scope. Authenticated tenant handlers use a checked-out PostgreSQL connection and transaction-local tenant context; runtime database roles are restricted to prevent owner-level RLS bypass.

## Development deployment snapshot (2026-11-12)

- Neon project: `frosty-cherry-92983148`; Development branch: `br-proud-paper-b312lfxi`. Production branch `br-late-cherry-b3uqtuvh` remains out of scope.
- Neon Function `pondokapi`, Development deployment #78, Node.js 24, completed. Deployment workflow #78 passed live HTTP checks for `/health/live`, `/health/ready`, and confirmed the retired `POST /v1/bootstrap/organization` endpoint returns HTTP 410.
- GitHub Pages #102, Release Bundle #158, and PONDOK OS CI #1792 all passed for main commit `710250c23d86a12a6ebe37121a61e77b07386651`.
- Development migration ledger is recorded through `0039 tenant_audit_append_only`. Migration 0039 is applied only to Development.
- The catalog contains 67 tables with `organization_id`; all 67 have ENABLE + FORCE RLS. Runtime-role policy coverage last verified: 63/63 tenant tables and 79/79 platform tables. These checks do not replace two-real-tenant acceptance.
- Development contains one explicitly named demo institution, one active owner membership, five demo student profiles, five demo HR employees, one demo customer, one subscription, one module entitlement and one module order. These are demonstration records, not a real pilot institution or real personal-data acceptance.
- `STUDENT_HEALTH_ENCRYPTION_KEY` and its version are configured. `STUDENT_IDENTITY_ENCRYPTION_KEY` is absent; identity-document operations must remain fail-closed until the key is provisioned through an approved secret vault and recoverable backup/rotation are tested.
- The demo backup policy is disabled. Its demo backup run failed and has no restore test. The backup executor, immutable/offsite storage and restore execution are not implemented; no backup readiness claim is permitted.
- CI exercises tenant isolation with synthetic signed identities and disposable PostgreSQL. Live Neon Auth acceptance with two real users and two actual non-production tenants remains pending, as does institution UAT.

The Development deployment workflow and deployment script are scoped to the Development project/branch. Do not repoint them to Production as part of routine work. Production branch `br-late-cherry-b3uqtuvh` must remain untouched.

## Database row-level security

The Development catalog audit verifies ENABLE + FORCE RLS for all 67 tables carrying `organization_id`. This is a database catalog result, not a substitute for API-level authorization testing. CI exercises RLS behavior against disposable PostgreSQL; live two-tenant API acceptance still requires two independently authenticated users and two actual non-production organizations.


## Contract subscription generation

- `GET /v1/platform/erp/subscriptions` lists subscription records; `GET /v1/platform/erp/subscriptions/:id` returns one record.
- `POST /v1/platform/erp/contracts/:id/subscriptions` creates subscriptions only from an active contract whose quote is approved or accepted.
- Only recurring `subscription` or `module` catalog lines with monthly, quarterly or yearly billing intervals are converted. Quantities must be whole numbers. Contract start/end dates define the subscription period; expired contracts are rejected.
- Migration `0029_platform_contract_subscriptions.sql` binds each subscription to its source quote line, stores the billing interval and quoted unit price/discount/tax/line-total snapshots, allows a `scheduled` state, and enforces one contract per quote and one subscription per quote line.
- Repeating the conversion is idempotent. The endpoint requires an active company Super Admin and the restricted platform runtime role.
- This creates commercial subscription records only. It does **not** issue invoices, collect payments, post journals, grant module entitlements, provision installations, or activate tenant modules. Those remain separate approval-controlled workflows.

## Recurring subscription invoices

- `POST /v1/platform/erp/subscriptions/:id/invoices` creates a draft invoice for a due, active recurring subscription with an active source contract and a customer that is not suspended or former.
- The request accepts only `dueOn`. The billing period uses the UTC calendar dates in the subscription's immutable `next_billing_at` and billing interval (monthly, quarterly or yearly); callers cannot override price, quantity, discount, tax or period.
- Invoice lines and totals use the subscription's stored quote snapshot. A period extending beyond the subscription end date is rejected until proration is implemented.
- Migration `0030_platform_recurring_invoice_periods.sql` stores inclusive billing-period dates and enforces one invoice per subscription period plus at most one open invoice per subscription.
- Repeating the request for the same period returns the existing invoice. A second open invoice is rejected. The new invoice remains draft until an authorized Super Admin issues it through the existing invoice workflow.
- The next billing date advances only when the invoice is fully paid through the existing verified-payment flow; partial or pending payments do not advance it. The payment verifier remains subject to maker-checker (creator cannot verify their own payment).
- No automatic scheduler, proration, late-fee/dunning, tax configuration, credit note, refund, bank reconciliation, entitlement grant or installation provisioning is introduced by this workflow.

## CRM lead conversion

A Super Admin can convert a CRM lead only after its stage is explicitly `won`:

- `POST /v1/platform/erp/leads/:id/convert` accepts customer legal/display names, optional entity type, billing details, address and optional existing `organizationId`.
- The operation locks the lead row and creates the commercial customer plus audit events in one transaction. Lead email/phone are used as billing-contact defaults when the request omits them.
- Converted customers start as `prospect`; conversion does not activate the customer, create a contract/subscription/invoice, provision an installation, or grant module entitlements.
- The partial unique index `platform_customers_one_per_source_lead` prevents duplicate customer records from one lead. Repeating a conversion returns the existing customer (HTTP 200); a lead not in `won` stage returns HTTP 409.
- The endpoint requires active company Super Admin authorization and the restricted platform runtime role. It does not change tenant state.

## Commercial customer ↔ institution tenant link

The CRM customer registry and institution tenant registry are separate domains. Migration `0027_platform_customer_tenant_link.sql` is applied on Development. It adds an optional `platform.customers.tenant_id` foreign key and a partial unique index (one commercial customer per tenant). An unlinked customer remains a prospect. The live Development registry still contains zero customer records.

- `POST /v1/platform/erp/customers` accepts optional `organizationId`; when supplied, the API verifies the tenant exists and is not already linked.
- `GET /v1/platform/erp/customers` and `GET /v1/platform/erp/customers/:id` return only the linked tenant's name and slug in addition to customer fields.
- `PATCH /v1/platform/erp/customers/:id` accepts exactly `{ "organizationId": "<uuid>" }` to link an existing prospect. The link is idempotent for the same tenant, cannot be reassigned or removed through this endpoint, and is audited.
- All operations require an active company Super Administrator and run through the restricted platform runtime role/RLS policy.
- This association does not create a contract, subscription, invoice, installation or module entitlement, and does not grant tenant module access.

## Migrations

Run `pnpm db:migrate` only after:
1. Confirming the exact target is the approved Development branch.
2. Reviewing the ordered migration files and checksums.
3. Reconciling manually applied objects with `core.schema_migrations`.
4. Confirming a recoverable backup/restore point and an approved execution window.

The runner serializes execution with a PostgreSQL advisory lock, verifies SHA-256 checksums, and applies each migration in its own transaction. Never run it against Production as part of this project workflow. Do not manually patch schema objects to bypass the migration ledger.

Migrations 0024, 0025 and 0026 are recorded as applied on Development as of 2026-11-08; migration 0027 is recorded as applied on 2026-11-09. The application was scoped to branch `br-proud-paper-b312lfxi`, preflighted against the expected 0023 ledger and absent target objects, guarded by an advisory lock, and committed atomically. SHA-256 checksums were computed from the exact repository file contents and stored in `core.schema_migrations`. Migration 0026 supplies the guardian-authority verification column and permission. Production was not targeted.

## Central activation and company administration

The distribution model uses company approval. New institutions submit an authenticated activation request; the request does not itself create a tenant or membership. A company Super Administrator approves or rejects it through Central Command. The retired public `POST /v1/bootstrap/organization` endpoint returns HTTP 410; the old direct-database `db:bootstrap` command and token generator are removed.

- `GET /v1/platform/admin/me`: reports whether the authenticated user has an active company Super Admin grant.
- `POST /v1/platform/activation-requests`: submits an institution request bound to the authenticated user.
- `GET /v1/platform/activation-requests/mine`: lists the caller's own requests.
- `GET /v1/platform/admin/activation-requests`: lists requests for company operators.
- `POST /v1/platform/admin/activation-requests/:id/approve`: approves a pending request and returns a one-time activation token; the database stores its SHA-256 digest.
- `POST /v1/platform/admin/activation-requests/:id/reject`: rejects a pending request with a recorded reason.
- `POST /v1/platform/activate`: redeems the user-bound token and creates the organization, owner membership, main campus, owner role and audit event in one transaction.

Tenant creation requires the institution's actual details and an authorized Super Administrator. Never create fake tenants, memberships, students, guardians or employees for demonstration. The operator account `akviso` is not a tenant member and must not be granted a tenant role.

## Student identity encryption

The identity-document API expects `STUDENT_IDENTITY_ENCRYPTION_KEY` to decode from base64 to exactly 32 bytes. The key is not currently present in the Development Function environment. The retired `PONDOK_BOOTSTRAP_TOKEN_SHA256` name still appears in Development Function environment metadata but is no longer referenced by the current API, web app, or deployment workflow; it must not be re-used and should be removed from the Function environment through an approved secret-management path. Do not enable identity-document writes until secure secret provisioning, recoverable encrypted backup and rotation/recovery procedures are in place. Never put key material in source control, logs or chat.

## Readiness boundary

A successful build, deployment, `/health/live`, `/health/ready`, or catalog RLS query does not mean PONDOK OS is ready for institutional operations. The Development deployment workflow now runs a live `POST /v1/bootstrap/organization` assertion expecting HTTP 410 after deployment/readiness. Function deployment #61 is completed, but a direct HTTP response could not be independently verified from the current inspection environment (DNS resolution failed); do not report the route check as independently confirmed until the workflow result is inspected. Readiness requires an actual institution tenant, two-tenant API isolation, role-based end-to-end workflows, backup/restore validation and institution UAT.

## Live Neon Auth tenant acceptance

The disposable CI test uses synthetic signed identities and disposable PostgreSQL. For the separate two-real-user/two-real-tenant Development acceptance, follow [the live Neon Auth tenant acceptance runbook](../../docs/security/live-neon-auth-tenant-acceptance.md) and run `node apps/api/scripts/test-live-tenant-auth-isolation.mjs` with local secret-manager environment variables. The script is pinned to the Development Function hostname, performs no data writes, and must never be run against Production.

