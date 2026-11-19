# Finance RBAC and Cost-Center Scope Design

**Status:** Design proposal only — not implemented  
**Applies to:** PONDOK OS tenant Finance APIs and tenant membership authorization  
**Safety boundary:** This document does not authorize database migrations, data changes, Neon Auth changes, or Production operations.

## 1. Problem statement

The current Finance API uses two authorization layers:

1. A tenant-wide gate that permits operational Finance endpoints only to `institution_owner` and `institution_admin`.
2. Endpoint-specific `finance.*` permission checks.

This is intentionally fail-closed. A member with `finance_officer` and explicit journal permissions can read account and fiscal-period reference data, but cannot read or write journals, post journals, close periods, or perform other Finance mutations.

The restriction is documented in `docs/runbooks/production-readiness.md`: scoped Finance members remain blocked from journal data and Finance writes until a reliable campus/cost-center relationship exists. Removing the tenant-wide gate alone would weaken that control without replacing it.

## 2. Authorization principles

- Tenant membership is mandatory. Platform roles, including `platform_super_admin`, never grant tenant Finance access.
- Every Finance query and mutation is constrained by the active `organization_id`.
- A permission authorizes an action; a Finance scope authorizes the financial records on which that action may operate. Both are required for scoped staff.
- No scope means no operational Finance access for scoped members.
- Owners and institution admins retain tenant-wide authority within their own organization, subject to explicit endpoint permissions and accounting controls.
- Finance staff receive only the permissions and cost-center assignments explicitly granted to their membership.
- A user cannot approve or post their own journal draft.
- Posted/reversed journals remain immutable. Corrections use reversal/adjustment workflows.
- Scope grants, revocations, permission changes, journal posting, period closing, and overrides must be auditable.
- UI visibility is never an authorization boundary; enforcement belongs in the API and database constraints/RLS.

## 3. Proposed resource model (requires a separately approved migration)

### 3.1 Finance cost centers

Introduce an organization-owned `finance.cost_centers` resource with:

- `id`, `organization_id`, `code`, `name`
- optional `parent_cost_center_id` for a hierarchy
- `is_active`, timestamps
- unique (organization, id) and (organization, code)
- composite self-reference to prevent cross-tenant parent links

A department may optionally map to a cost center, but a free-text HR `cost_center` label is not an authorization relationship and must not be trusted as one.

### 3.2 Membership finance scopes

Introduce tenant-bound, effective-dated membership grants, e.g. `core.membership_finance_scopes`:

- `organization_id`, `membership_id`, `cost_center_id`
- `valid_from`, optional `valid_until`, optional `revoked_at`
- `granted_by`, timestamps and audit correlation
- composite foreign keys tying membership and cost center to the same organization
- active-scope uniqueness/overlap rules defined and tested before deployment

Only authorized tenant administrators may grant or revoke these scopes. Scope changes must be audited and must not create or change platform roles.

### 3.3 Journal-line attribution

A journal can legitimately span more than one cost center. Therefore cost-center attribution belongs on each `finance.journal_lines` row, not only on the journal header.

The eventual migration should add a nullable, tenant-bound `cost_center_id` to journal lines. Existing historical rows must remain explicitly unassigned until reconciled; do not silently infer or backfill assignments from descriptions or free-text department labels.

Before scoped journal creation is enabled, every line must have a valid active cost center. The API must verify that the member has a current grant for every cost center used by the journal. A journal containing even one out-of-scope line must be rejected atomically.

## 4. Permission model

The following is a proposed minimum separation; final role templates must be reviewed before implementation.

| Permission | Purpose | Suggested authority |
|---|---|---|
| `finance.accounts.read` | Read tenant chart of accounts | Assigned Finance staff |
| `finance.accounts.write` | Create/manage chart of accounts | Finance lead or tenant authority |
| `finance.journals.read` | Read journals whose lines are in assigned scopes | Assigned Finance staff |
| `finance.journals.write` | Create drafts for assigned cost centers | Assigned Finance staff |
| `finance.journals.post` | Post eligible drafts after independent review | Separate authorized reviewer |
| `finance.periods.read` | Read tenant fiscal-period metadata | Assigned Finance staff |
| `finance.periods.manage` | Create/manage fiscal periods | Finance lead or tenant authority |
| `finance.periods.close` | Close a period after all close controls pass | Explicitly designated approver |

Do not treat the existence of a permission string as proof that its role template or endpoint is safe. Review role-permission assignments and server-side checks together.

## 5. Required API enforcement

Before enabling scoped Finance operations:

1. Resolve the active tenant membership and its current permissions/scopes server-side.
2. Keep all SQL tenant-bound with `organization_id`.
3. For journal reads, return a journal only when the member is authorized for every relevant line/cost center; avoid leaking descriptions, amounts, counterparties, or existence of out-of-scope journals.
4. For journal creation, validate the fiscal period, accounts, and every line's cost center in one transaction. Reject the entire request if any line is out of scope.
5. For journal posting, re-check scope and permissions at posting time, require a different actor from the creator, and preserve database balance/period/immutability constraints.
6. For period closing, require explicit close permission and tenant-wide close controls; scoped cost-center access alone must not imply authority to close the whole tenant's books.
7. Keep chart-of-account and fiscal-period metadata tenant-wide reference reads only where explicit read permission exists.
8. Return consistent 403 responses without revealing whether an out-of-scope record exists.

## 6. Acceptance tests required

The implementation is not acceptable until automated API/database tests prove:

- Owner and institution admin can perform only explicitly permitted actions within their own tenant.
- Finance officer with read/write permission and one cost-center grant can read/create only journals wholly within that grant.
- Finance officer cannot read a journal containing an out-of-scope line, including mixed-scope journals.
- Finance officer cannot create a journal with an unassigned or out-of-scope line.
- Finance clerk with read-only or draft-entry permissions cannot post, close periods, or manage the chart of accounts unless separately granted.
- Revoked, expired, future-dated, or cross-tenant scopes do not authorize access.
- A member of tenant A cannot read or mutate tenant B Finance records, even with matching IDs or identical role keys.
- Platform Super Admin without tenant membership/Finance permission receives no tenant Finance access.
- Journal maker cannot post their own draft; a separate authorized reviewer can post only after revalidation.
- Closed periods, unbalanced journals, invalid account references, duplicate journal numbers, and posted-journal mutation remain rejected.
- All authorization failures occur before sensitive Finance data is returned or changed.
- Audit events record grants/revocations and critical Finance transitions without exposing secrets.

## 7. Safe implementation sequence

1. Approve the resource model and accounting policy with the product owner and qualified accounting reviewer.
2. Prepare an additive Development-only migration proposal; do not deploy it until explicitly approved.
3. Implement tenant-bound scope grant/revoke APIs and audit events.
4. Implement journal-line cost-center attribution with no guessed historical backfill.
5. Add transactional authorization for reads, draft creation, posting, and close workflows.
6. Add role templates for Finance lead, Finance officer, and Finance clerk using least privilege.
7. Run unit, integration, RLS, two-tenant isolation, and maker-checker tests against Neon Development.
8. Perform a supervised end-to-end Finance UAT before any Production release consideration.

## 8. Current release posture

Until the model above is implemented and tested:

- Keep the current fail-closed tenant-wide Finance gate.
- Scoped Finance members may read only explicitly permitted tenant-wide reference data already supported by the API.
- Do not grant journal, posting, period-close, or Finance-write access to scoped members by weakening the current guard.
- Do not claim Finance role readiness or commercial release readiness.
- Do not make any Production changes.

This is a design checkpoint, not evidence that scoped Finance access is implemented.
