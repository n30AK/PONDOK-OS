# Identity and tenant security foundation

## Identity provider

PONDOK OS retains the existing Neon Managed Auth identity. The API accepts its EdDSA JWTs and verifies signatures against the branch-specific JWKS URL. The issuer is configured explicitly; neither issuer nor JWKS endpoint is guessed or hard-coded.

## Tenant boundary

The browser must send an organization UUID as a tenant selector, but this value is untrusted input. The API independently resolves an active membership for the verified JWT subject and selected organization. Roles and permission keys are loaded from the core RBAC tables. No client-provided role or permission claim is accepted.

Every authenticated tenant request runs on one checked-out PostgreSQL connection. The API sets `app.user_id` from the verified JWT subject and `app.organization_id` from the selected organization using transaction-local settings. The settings are cleared automatically at transaction end and cannot leak through a pooled connection to the next request.

Migration `0013_tenant_row_level_security.sql` adds `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` to 59 organization-owned tables across 15 schema groups. Each policy checks both the selected organization and an active membership for the API user. Global system roles remain readable, while tenant requests cannot create or modify global role templates.

`core.organization_memberships` is intentionally excluded from this RLS migration because it is the membership authority used by the policy predicate. The API queries it using both the verified user ID and selected organization ID. This exclusion is an explicit hardening boundary, not a claim that every table is RLS-protected.

## Failure behavior

- Missing or malformed bearer token: 401.
- Invalid signature, issuer, algorithm, expiry, or subject: 401.
- Missing/invalid organization selector: 400.
- No active membership: 403.
- Missing server configuration: 503.
- Unexpected database errors: generic 500 without exposing SQL or secrets.

## Current activation state

The RLS migration and API transaction-context code are in the repository and covered by CI integration tests. The migration has not yet been applied to the Neon development branch. The matching API build must be deployed first; migration 0013 can then be applied on development and verified with live sign-in and at least two separate tenant users. Production must remain untouched until the production-readiness gate is approved.

## Remaining security work

This is not a completed security certification. Remaining work includes direct database privilege review for the membership authority table, campus-level authorization, rate limiting, security logging and abuse monitoring, broader audit coverage for sensitive access, refresh/session lifecycle integration, production secrets management, backup/restore verification, and live two-tenant acceptance.

## Verification

CI runs the migration against disposable PostgreSQL 18 and tests tenant isolation with a restricted non-owner role. It verifies missing-context denial, bidirectional tenant visibility, cross-tenant write rejection, organization-header spoofing resistance, and the first-organization bootstrap write sequence under FORCE RLS. Live sign-in/JWT-to-Neon-DB integration and institution acceptance remain pending.
