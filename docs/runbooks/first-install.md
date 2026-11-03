# First institution installation

This runbook initializes the first institution on a **development or staging branch**. Do not use it to initialize production before the production readiness checklist has been approved.

## 1. Prepare the environment

1. Provision a Neon development or staging branch and enable Neon Managed Auth on that same branch.
2. Configure the web trusted origin in Neon Auth.
3. Configure the API with the matching branch's `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_JWKS_URL`. Never mix URLs from different branches.
4. Deploy/start the API build that includes transaction-scoped tenant context and the RLS-compatible first-organization bootstrap. The API must be running before migration 0013 is activated.
5. Apply the repository migrations using the explicit migration runner. On the current PONDOK OS development branch, migrations 0013 and 0014 are applied and verified. Migration 0013 enforces RLS on 59 tenant-owned tables; migration 0014 creates the restricted `pondok_runtime` role.
6. Confirm the migration ledger includes 0013 and 0014, verify the expected RLS flags and restricted runtime role, and verify the deployed API readiness endpoint before allowing tenant setup.

Migrations are not run automatically when the API container starts. Do not activate migration 0013 on a branch still serving an older API build that does not set transaction-local tenant context.

## 2. Generate a one-time setup credential

Run this locally from the repository root:

```bash
node scripts/create-bootstrap-token.mjs
```

The script prints a random 256-bit token and its SHA-256 digest. It does not write either value to disk.

- Configure only the digest as `PONDOK_BOOTSTRAP_TOKEN_SHA256` in the API environment.
- Restart/redeploy the API after setting the variable.
- Keep the raw token temporarily in a password manager or secure clipboard. Do not commit it or send it in chat.

## 3. Initialize the institution owner

1. Open the PONDOK OS web workspace.
2. Choose **Penyiapan pertama kali**.
3. Register the first administrator using the email/password form. If the administrator account was already created during an earlier failed attempt, switch the form to **Gunakan akun yang ada** and sign in instead.
4. Enter the institution name, unique slug, main campus code/name, and raw one-time token.
5. Submit once. The API verifies the Neon JWT and token digest, serializes initialization with a PostgreSQL advisory transaction lock, creates the organization and active owner membership, sets transaction-local tenant context, switches to `pondok_runtime`, and then creates the campus, owner role assignment and audit event atomically. This order is required by FORCE RLS and migration 0014's restricted privileges.
6. Save the returned organization ID in the institution's secure administrative record.

The endpoint refuses initialization if any organization already exists. A failed attempt may leave an unassigned Neon Auth user if sign-up succeeded but the bootstrap token or database step failed. Correct the configuration and sign in with the same account before retrying; do not create additional administrator identities unnecessarily.

The operator CLI bootstrap follows the same membership-before-campus/audit sequence and can be used for a controlled first-install workflow.

## 4. Remove the bootstrap credential

Immediately after successful initialization:

1. Remove `PONDOK_BOOTSTRAP_TOKEN_SHA256` from the API environment.
2. Restart/redeploy the API.
3. Confirm a second bootstrap attempt is rejected.
4. Confirm the first administrator can sign in and open the new organization.
5. Confirm an unrelated user receives 403 when requesting the organization context.

## 5. Acceptance boundary

This procedure creates the first owner and tenant. It does not constitute full production acceptance. Before real student, guardian, employee or financial data is imported, complete the production readiness gate, verify tenant isolation with two separate organizations, configure backup/restore, and complete institution workflow testing.
