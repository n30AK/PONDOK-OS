# First institution activation (centralized SaaS)

PONDOK OS uses a centralized company approval model. New institutions must not create their own tenant directly. Tenant creation is controlled by the authenticated applicant → company Super Administrator approval → one-time activation-token workflow.

## Development rollout prerequisites

1. Confirm the Neon Development branch is selected: `br-proud-paper-b312lfxi`.
2. Confirm the Development Neon Auth and API URLs belong to the same branch.
3. Confirm migration `0016_central_activation_control_plane.sql` is recorded in `core.schema_migrations` on Development.
4. Confirm migrations `0017`, `0018` and `0019` are present in `core.schema_migrations` on Development; verify the seven Module Registry/master-data tables and confirm `core.organization_memberships` has ENABLE + FORCE RLS with three explicit policies. Production remains untouched.
5. Sign in to the verified, unbanned Development Neon Auth account provisioned as the company Super Administrator. The current Development account has been verified and is active.
6. Verify the account's UUID, email verification status and unbanned status using the Development Auth database.

## Provision the first company Super Administrator

The first Super Administrator is not self-service. On the current Development environment, the controlled bootstrap has been completed for the single verified, unbanned Auth account. For any future replacement or additional Super Administrator, use the controlled SQL grant in [Central activation architecture](../architecture/central-activation-control-plane.md), after independent identity verification.

Never grant Super Admin based only on a submitted email, a tenant membership, or a browser parameter. Production must remain untouched.

## One-time first tenant bootstrap

Development currently has one verified, active Super Administrator and no organization. The Super Administrator must use the **Inisialisasi lembaga pertama** form in Central Command and enter the real institution details; do not invent a tenant or create placeholder institution records.

This bootstrap is only for the first Development tenant. It creates a pending `trial-14d` license bound to the verified Super Administrator; the 14-day countdown starts only when that owner first opens the authenticated tenant workspace. Subsequent institutions must use the normal applicant → approval → one-time activation-token workflow.

## Institution registration and approval

1. The institution contact creates or signs in to their Neon Auth account.
2. The applicant verifies their email address with Neon Auth.
3. From the authenticated workspace entry page, the applicant submits the institution activation request. The contact email must match the verified, unbanned Neon Auth account.
4. The API stores the request as `pending`; it does not create an organization, membership, campus, or tenant access.
5. A company Super Administrator reviews the request in Central Command and approves or rejects it.
6. On approval, the API creates a 256-bit random activation token, stores only its SHA-256 hash, binds it to the requesting user, and sets a 24-hour expiry. The raw token is revealed once to the approving operator.
7. The company sends the token to the verified contact through an approved channel.
8. The applicant signs in with the same account and redeems the token.
9. The API atomically creates the organization, owner membership, main campus, owner role assignment, and audit events. The token is consumed in the same transaction.
10. Verify that the owner opens the workspace and that a different user cannot access the tenant.

## Security and acceptance checks

- [ ] Non-admin receives 403 from all company approval endpoints.
- [ ] Applicant can see only their own activation requests.
- [ ] Contact email must match a verified, unbanned Neon Auth account.
- [ ] Raw token is never stored or logged.
- [ ] Token is user-bound, expires after 24 hours and cannot be reused.
- [ ] Token issuance is restricted to active Super Administrators.
- [ ] Tenant creation is atomic; partial organization/membership/campus writes roll back.
- [ ] Platform operations run under `pondok_platform_runtime` (NOLOGIN/NOBYPASSRLS).
- [ ] Campus, membership-role and tenant audit writes remain subject to tenant FORCE RLS.
- [ ] Two-tenant isolation and role-permission acceptance tests pass.
- [ ] Backup/restore and operational UAT are completed before production onboarding.

## Legacy bootstrap

`POST /v1/bootstrap/organization` is disabled in the API source and returns HTTP 410. The old token-based setup form and `PONDOK_BOOTSTRAP_TOKEN_SHA256` configuration have been retired from the application and deployment workflow. The Development Function metadata still showed a legacy value in deployment #56; remove that stale value only after the next Development deployment workflow passes its live HTTP 410 check. Do not set the variable again. Direct HTTP verification of the currently active deployment has not yet been independently confirmed.

No instruction in this runbook authorizes a Production database migration, Super Admin grant, Function deployment, or credential change.
