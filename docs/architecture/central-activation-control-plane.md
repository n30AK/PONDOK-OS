# PONDOK OS Central Activation & Super Administration

## Architecture decision

PONDOK OS uses a centralized SaaS control plane with approval-based activation.

- The company operates the platform control plane and grants/revokes Super Administrator access.
- Each institution is a separate tenant and retains control of its own day-to-day workspace.
- Registration creates an activation request only; it does not create an organization or grant tenant access.
- A company Super Administrator reviews and approves or rejects each request.
- Approval creates a cryptographically random, single-use activation token. Only its SHA-256 hash is stored.
- The token is bound to the requesting Neon Auth user and expires after 24 hours.
- Successful redemption creates the organization, owner membership, primary campus, owner role and audit event atomically.
- Production is outside this rollout. This change set targets Development only.

## Security boundaries

1. Email is an identity/contact attribute, never a secret or token derivation input.
2. The API verifies Neon JWT issuer, signature, expiry and subject before all platform operations.
3. Super Administrator status is stored separately from tenant memberships in `platform.super_admins`.
4. A tenant owner cannot promote themselves to Super Administrator.
5. Activation tokens are generated with a cryptographic random source, stored as SHA-256 hashes, single-use, user-bound and time-limited.
6. Raw tokens are returned only once to the approving Super Administrator. They must not be logged, persisted in frontend storage, or committed.
7. Tenant creation is one transaction. The owner membership is created before switching to `pondok_runtime` for FORCE-RLS-protected campus, role and audit writes.
8. Platform actions are recorded separately in `platform.audit_events`.
9. No platform migration is applied to Neon as part of this PR. Apply only after reviewing the migration against the Development branch and obtaining separate approval.

## Activation lifecycle

`pending -> approved -> activated` or `pending -> rejected`.

- Applicant: sign in, submit institution and primary-campus details, view own request status.
- Company Super Admin: list pending requests, inspect details, approve/reject.
- Approval: API issues a 256-bit random token, returns it once, stores only its digest, binds it to the requesting user, and sets a 24-hour expiry.
- Redemption: requesting user signs in and submits token; API locks token/request rows, checks binding/expiry/consumption, creates tenant records and consumes token in one transaction.

Email delivery is intentionally not silently assumed. The first implementation supports secure one-time reveal/copy by the company operator. Automated email delivery is a separate integration requiring an approved sender/domain and credentials; it must not block local Development verification.

## First Super Administrator provisioning

The migration intentionally does not seed a privileged account. After migration is reviewed and applied to Development, a company operator must:
1. Register/sign in the designated company account through the Development Neon Auth.
2. Verify the account UUID from `neon_auth."user"` using an authorized operator session.
3. Grant the first Super Admin using the reviewed, controlled SQL procedure in the deployment checklist.
4. Verify that an ordinary tenant user receives 403 from all `/v1/platform/admin/*` endpoints.

Never derive a Super Admin grant from email alone, a public URL parameter, or a tenant role.

## Development rollout gate

- [ ] Review migration 0016 and grants/RLS policies.
- [ ] Apply migration 0016 to Development only after separate approval.
- [ ] Provision first Super Admin out-of-band.
- [ ] Deploy API and frontend from the feature branch to a Development preview.
- [ ] Verify applicant request creation and ownership isolation.
- [ ] Verify non-admin cannot list, approve, reject or issue tokens.
- [ ] Verify approval token is shown once, bound to applicant, expires and cannot be reused.
- [ ] Verify atomic tenant bootstrap and owner workspace access.
- [ ] Verify tenant A cannot access tenant B or platform control-plane data.
- [ ] Verify Production branch and deployment remain unchanged.
