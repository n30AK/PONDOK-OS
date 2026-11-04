# First institution activation (centralized SaaS)

PONDOK OS uses a centralized company approval model. New institutions must not create their own tenant through the legacy bootstrap form.

## Development rollout prerequisites

1. Confirm the Neon Development branch is selected: `br-proud-paper-b312lfxi`.
2. Confirm the Development Neon Auth and API URLs belong to the same branch.
3. Confirm migration `0016_central_activation_control_plane.sql` is recorded in `core.schema_migrations` on Development.
4. Review any new migration separately. Migration 0018 requires explicit approval before application; this runbook does not authorize it.
5. Sign in to the verified, unbanned Development Neon Auth account intended to operate as the company Super Administrator.
6. Verify the account's UUID, email verification status and unbanned status using the Development Auth database.

## Provision the first company Super Administrator

The first Super Administrator is not self-service. On the current Development environment, the controlled bootstrap has been completed for the single verified, unbanned Auth account. For any future replacement or additional Super Administrator, use the controlled SQL grant in [Central activation architecture](../architecture/central-activation-control-plane.md), after independent identity verification.

Never grant Super Admin based only on a submitted email, a tenant membership, or a browser parameter. Production must remain untouched.

## One-time first tenant bootstrap

When Development has exactly one verified, active Super Administrator and no organization exists, the Super Administrator may use the **Inisialisasi lembaga pertama** form in Central Command. The API rechecks the administrator authority, verified/unbanned Auth account, and zero-organization condition inside a transaction protected by an advisory lock. It atomically creates the first organization, owner membership, main campus, owner role assignment and tenant/platform audit events. The Super Administrator becomes the first Pemilik Institusi. The endpoint returns HTTP 409 after any organization already exists and cannot be used as a general tenant-creation endpoint.

This bootstrap is only for the first Development tenant. Subsequent institutions must use the normal applicant → approval → one-time activation-token workflow.

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

`POST /v1/bootstrap/organization` is disabled and returns HTTP 410 in the centralized distribution architecture. The old `PONDOK_BOOTSTRAP_TOKEN_SHA256` mechanism must not be used for institution onboarding. Remove its Development Function environment value only after the new API build is deployed and its route-disable behavior is verified.

No instruction in this runbook authorizes a Production database migration, Super Admin grant, Function deployment, or credential change.
