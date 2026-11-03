# Identity and tenant security foundation

## Identity provider

PONDOK OS retains the existing Neon Managed Auth identity. The API accepts its EdDSA JWTs and verifies signatures against the branch-specific JWKS URL. The issuer is configured explicitly; neither issuer nor JWKS endpoint is guessed or hard-coded.

## Runtime database role

The managed Neon owner role used by the default connection URI has `BYPASSRLS = true`. It must be used only for controlled migrations and operator actions, never by the API runtime.

Migration `0014_application_runtime_role.sql` creates/grants `pondok_app` with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, and `NOINHERIT`. The API uses `PONDOK_DATABASE_URL` for this role. The migration ledger and global RBAC dictionaries are not writable by the runtime role. New tables require explicit grants in their migration; no blanket default privileges are installed.

## Tenant boundary

The browser must send an organization UUID as a tenant selector, but this value is untrusted input. The API independently resolves an active membership for the verified JWT subject and selected organization. Roles and permission keys are loaded from the core RBAC tables. No client-provided role or permission claim is accepted.

Every authenticated tenant request runs on one checked-out PostgreSQL connection. The API sets `app.user_id` from the verified JWT subject and `app.organization_id` from the selected organization using transaction-local settings **before** it queries the membership authority. The settings are cleared automatically at transaction end and cannot leak through a pooled connection to the next request.

Migration `0013_tenant_row_level_security.sql` enables and forces RLS on 60 organization-owned tables across 15 schema groups. It also protects `core.organizations`, `core.organization_memberships`, and `core.membership_roles` with dedicated policies. Membership rows are visible/insertable only when both `user_id` and `organization_id` match the transaction-local context. Membership-role rows are readable only through the caller's own visible membership.

The `core.has_active_tenant_membership(uuid)` predicate is owned by `pondok_app`, not the managed owner. Therefore its membership lookup is also subject to the direct membership RLS policy and cannot bypass it. The `core.first_organization_exists()` and `core.bootstrap_initial_owner_role(uuid)` SECURITY DEFINER helpers are narrowly scoped: one reveals only whether the global registry is empty; the other assigns the system owner role only to the sole active member of a tenant with no existing role assignments. The application role cannot directly write membership-role assignments.

## Failure behavior

- Missing or malformed bearer token: 401.
- Invalid signature, issuer, algorithm, expiry, or subject: 401.
- Missing/invalid organization selector: 400.
- No active membership: 403.
- Missing server configuration: 503.
- Unexpected database errors: generic 500 without exposing SQL or secrets.

## Current activation state

The API now has a restricted-role connection path and matching code/migrations. Migrations 0013/0014 have not yet been applied to Neon development. The matching API build must be deployed first, the `pondok_app` login role provisioned, and the function/container configured with its restricted `PONDOK_DATABASE_URL`; only then should the migration runner activate RLS on development. Verify the live role reports `rolbypassrls=false` and test at least two separate tenant users. Production remains untouched until the production-readiness gate is approved.

## Remaining security work

This is not a completed security certification. Remaining work includes campus-level authorization, rate limiting, security logging and abuse monitoring, broader audit coverage for sensitive access, refresh/session lifecycle integration, production secrets management, backup/restore verification, and live two-tenant acceptance.

## Verification

CI runs migrations against disposable PostgreSQL 18 and tests with the exact restricted `pondok_app` role. It verifies that the role cannot bypass RLS, missing-context denial, bidirectional tenant visibility, cross-tenant membership and data-write rejection, organization-header spoofing resistance, and first-organization bootstrap under FORCE RLS. Live sign-in/JWT-to-Neon-DB integration and institution acceptance remain pending.
