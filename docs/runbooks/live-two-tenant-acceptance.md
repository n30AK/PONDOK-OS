# Live two-tenant acceptance — Neon Development only

**Status:** prepared; execution is blocked until a second, independently controlled Neon Auth user completes verification and activation.  
**Approved target:** Neon project `frosty-cherry-92983148`, branch `br-proud-paper-b312lfxi`.  
**API:** `https://br-proud-paper-b312lfxi-pondokapi.compute.c-4.ap-southeast-1.aws.neon.tech`.  
**Production:** `br-late-cherry-b3uqtuvh` is strictly out of scope.

## Current preflight evidence (2026-11-17)

Read-only Development queries found:

- 5 Neon Auth users, 1 verified user, 5 unbanned users.
- 1 organization and 1 active membership.
- 1 pending activation request; its requester is the existing active company Super Admin. That requester cannot approve their own request. Do not try to approve, mutate, or redeem this request as a workaround.
- The existing organization is the Development demo tenant. Use synthetic test data only.

Neon Auth email/password settings were updated and re-read on the Development branch:

- Sign-up remains enabled.
- Email verification is required.
- OTP verification is sent on sign-up and sign-in.
- Auto sign-in after successful verification is enabled.

This aligns account creation with the API requirement that activation applicants have a verified, unbanned email address. No user, organization, membership, schema, migration or data row was created or modified by this configuration change.

## Create the second test identity and tenant

1. Open the existing PONDOK OS application at its trusted origin: `https://n30ak.github.io`.
2. Register a separate test account using an email inbox controlled by the test operator. It must not be the existing company Super Admin account.
3. Complete the Neon Auth email OTP verification. Do not share passwords, OTPs, session cookies or bearer tokens in chat, GitHub issues, screenshots or logs.
4. Sign in with the new account and submit an institution activation request from the authenticated workspace entry page. Use synthetic Development-only institution data and a unique slug/campus code. The contact email must exactly match the verified account email.
5. The existing company Super Admin reviews this new request in Central Command. Confirm the requester user ID differs from the reviewer user ID and review the synthetic institution details before approval.
6. The approval endpoint issues a random, single-use, 24-hour activation token bound to the applicant. Deliver it only through an approved private channel; do not put it in GitHub, chat, CI output or ordinary logs.
7. The applicant signs in with the same account and redeems the token in the activation panel. The API transaction creates the second organization, owner membership, main campus, institution-owner role and audit events.
8. Verify the new account is an institution owner only. It must not appear in `platform.super_admins`, and `GET /v1/platform/admin/me` must report `isSuperAdmin: false` for the institution account.
9. Verify the original pending request remains untouched; it is unrelated to this acceptance run.

Do not call the retired first-tenant bootstrap endpoint. Do not create the organization directly with SQL or a seed script.

## Live API acceptance

The existing harness is `apps/api/scripts/test-live-tenant-auth-isolation.mjs`. It is hard-pinned to the Development API hostname and refuses any other host. It checks:

- two distinct JWT subjects and two distinct organization UUIDs;
- each user can resolve and read only their own tenant;
- the API reports restricted runtime role `pondok_runtime` and all tenant tables protected;
- changing tenant context to the other organization is denied with HTTP 403;
- cross-tenant read and write probes are denied with HTTP 403 before payload validation;
- optional tenant sentinel codes are not disclosed across tenants;
- the institution account is not a platform Super Admin.

A manual GitHub Actions workflow, `PONDOK OS Live Tenant Auth Acceptance`, is provided in this PR. Before dispatching it, add these values under GitHub repository Settings → Secrets and variables → Actions → Secrets:

- `TENANT_A_BEARER_TOKEN`
- `TENANT_B_BEARER_TOKEN`
- `TENANT_A_ORGANIZATION_ID`
- `TENANT_B_ORGANIZATION_ID`

Optional sentinel values may be added as secrets:

- `TENANT_A_SENTINEL_PROGRAM_CODE`
- `TENANT_B_SENTINEL_PROGRAM_CODE`

The API base URL is hardcoded in the workflow to the approved Development endpoint; it is not a user-supplied input. Do not print or echo secret values. Run the workflow manually only after both accounts and both tenant memberships are ready. Save the workflow URL, run ID, commit SHA, deployment ID and pass/fail outcome as evidence; never save tokens.

## Important test boundary

The current harness proves two-user/two-tenant context, read and write isolation. It does **not** yet prove membership revocation or a non-owner permission boundary. The current tenant-member API supports member invitation, role changes and scope revocation, but no membership suspension/revocation endpoint was found in the inspected route. Those controls remain a separate implementation gap; do not claim them as tested.

The two-tenant harness uses read operations and a deliberately invalid cross-tenant write body; it creates no records. Do not add real student, health, identity, payroll or financial data to either test tenant.

## Stop conditions

Stop and preserve evidence if any of these occur:

- The applicant email is not verified or the contact email differs from the verified account.
- The requester and reviewer IDs are equal.
- The institution account receives platform Super Admin authority.
- The activation token is expired, replayed, redeemed by a different user or exposed in logs.
- Any cross-tenant context/read/write request returns anything other than the expected denial.
- The workflow API hostname differs from the hardcoded Development host.
- Any action would touch Neon Production.

A passing harness is one G1 evidence item, not commercial release approval. Backup/restore, identity-key recovery, private attachments, role-based UAT and commercial lifecycle gates remain independent blockers.
