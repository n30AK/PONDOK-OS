# First institution installation

This runbook initializes the first institution on a **development or staging branch**. Do not use it to initialize production before the production readiness checklist has been approved.

## 1. Prepare the environment

1. Provision a Neon development or staging branch and enable Neon Managed Auth on that same branch.
2. Configure the web trusted origin in Neon Auth.
3. Deploy the matching API build containing transaction-scoped tenant context and the RLS-compatible first-organization bootstrap.
4. Provision a dedicated `pondok_app` login role with `NOBYPASSRLS`, `NOINHERIT`, and no superuser/database/role-creation privileges. The repository activation workflow provisions this role before applying migration 0014.
5. Configure the API with `PONDOK_DATABASE_URL` for `pondok_app`, plus `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` from the same branch. Do not use Neon’s managed owner `DATABASE_URL` for the API runtime; that role has BYPASSRLS.
6. Apply pending migrations using the explicit migration runner and the admin `DATABASE_URL`. On the current PONDOK OS development branch, versions 0001–0012 are already recorded; 0013 and 0014 are pending.
7. Verify `pondok_app.rolbypassrls = false`, the migration ledger includes 0013/0014, and all 60 organization-owned tables have ENABLE + FORCE RLS before allowing tenant setup.

Migrations are not run automatically when API containers start. Do not activate migration 0013 on a branch still serving an older API build. The API runtime must use `PONDOK_DATABASE_URL`; `DATABASE_URL` is reserved for migrations and controlled operator actions.

## 2. Generate a one-time setup credential

Run this locally from the repository root:

```bash
node scripts/create-bootstrap-token.mjs
```

The script prints a random 256-bit token and its SHA-256 digest. It does not write either value to disk.

- Configure only the digest as `PONDOK_BOOTSTRAP_TOKEN_SHA256` in the API/function environment.
- Restart/redeploy the API after setting the variable.
- Keep the raw token temporarily in a password manager or secure clipboard. Do not commit it or send it in chat.

## 3. Initialize the institution owner

1. Open the PONDOK OS web workspace.
2. Choose **Penyiapan pertama kali**.
3. Register the first administrator using the email/password form. If the administrator account was already created during an earlier failed attempt, switch the form to **Gunakan akun yang ada** and sign in instead.
4. Enter the institution name, unique slug, main campus code/name, and raw one-time token.
5. Submit once. The API verifies the Neon JWT and token digest, serializes initialization with a PostgreSQL advisory transaction lock, checks the global first-organization gate, sets verified user/tenant context, inserts the organization and self-membership under RLS, creates the campus, calls the one-time initial-owner helper, and appends the audit event atomically.
6. Save the returned organization ID in the institution's secure administrative record.

The endpoint refuses initialization if any organization already exists. A failed attempt may leave an unassigned Neon Auth user if sign-up succeeded but the bootstrap token or database step failed. Correct the configuration and sign in with the same account before retrying; do not create additional administrator identities unnecessarily.

The operator CLI bootstrap follows the same transaction/context sequence. It uses the admin `DATABASE_URL` only for controlled operator setup and verifies the supplied user exists in `neon_auth."user"`.

## 4. Remove the bootstrap credential

Immediately after successful initialization:

1. Remove `PONDOK_BOOTSTRAP_TOKEN_SHA256` from the API/function environment.
2. Restart/redeploy the API.
3. Confirm a second bootstrap attempt is rejected.
4. Confirm the first administrator can sign in and open the new organization.
5. Confirm an unrelated user receives 403 when requesting the organization context.

## 5. Acceptance boundary

This procedure creates the first owner and tenant. It does not constitute full production acceptance. Before real student, guardian, employee or financial data is imported, complete the production readiness gate, verify tenant isolation with two separate organizations, configure backup/restore, and complete institution workflow testing.
