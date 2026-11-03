# Neon Functions API + GitHub Pages frontend

This is the zero-additional-hosting-cost development path for PONDOK OS. Neon Functions runs the API beside the existing Neon database; GitHub Pages serves the static React/PWA workspace. Neon Functions is backend hosting, not a static frontend host.

## Fixed development targets

- Neon project: `frosty-cherry-92983148`
- Development branch: `br-proud-paper-b312lfxi`
- Function slug: `pondokapi`
- Function runtime: `nodejs24`
- GitHub Pages project URL: `https://n30ak.github.io/PONDOK-OS/`
- GitHub Pages origin / CORS origin: `https://n30ak.github.io`
- Neon Auth base URL: `https://ep-billowing-boat-b3junw8u.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth`
- Neon Auth JWKS URL: `https://ep-billowing-boat-b3junw8u.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth/.well-known/jwks.json`

The deployment workflow and script hardcode the development project and branch. Do not change them to the production branch as part of a routine deploy.

## 1. Add the scoped deployment credential

The deployment workflow needs a Neon API key. Create a **project-scoped** key for project `frosty-cherry-92983148` in Neon Console → Account / Developer Settings → API Keys.

A project-scoped key is still powerful inside its project; it can manage project resources and branches. Keep it out of source files and never paste it into chat or logs.

Add it to GitHub:

1. Open repository Settings → Secrets and variables → Actions.
2. Select **New repository secret**.
3. Name: `NEON_API_KEY`.
4. Value: the project-scoped key.
5. Do not create a plain repository variable for this credential.

## 2. Deploy the development API

1. Open repository Actions.
2. Select **Deploy PONDOK OS API to Neon Development**.
3. Choose **Run workflow**.
4. Enter exactly `DEPLOY_DEV_API` in the confirmation field.
5. Wait for the workflow to finish.

The deployment script bundles the API and deploys slug `pondokapi` to branch `br-proud-paper-b312lfxi` only. It prints the invocation URL when Neon reports the deployment as completed.

Neon Functions injects the branch's `DATABASE_URL` automatically. The deployment script explicitly sets the matching branch's `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL`, and `CORS_ALLOWED_ORIGINS`; do not assume the Auth URLs are automatically present in the Function runtime.

Verify the function URL:

```bash
curl -i https://<function-invocation-host>/health/live
curl -i https://<function-invocation-host>/health/ready
```

Expected: `/health/live` returns HTTP 200. `/health/ready` returns HTTP 200 when the branch-injected database connection is available.

## 3. Enable GitHub Pages once

1. Open repository Settings → Pages.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Save the setting.

The repository includes a manual workflow named **PONDOK OS GitHub Pages**. It builds the web workspace with the project subpath and the selected development API/Auth URLs.

## 4. Deploy the web workspace

1. Open repository Actions.
2. Select **PONDOK OS GitHub Pages** → **Run workflow**.
3. Paste the Neon Function invocation URL printed by the API deployment workflow into `api_base_url` (without a trailing slash).
4. Keep the default Neon Auth URL unless the development branch/Auth integration is deliberately changed.
5. Run the workflow and open the resulting Pages URL.

The expected URL is `https://n30ak.github.io/PONDOK-OS/`. The origin `https://n30ak.github.io` has been added to Neon Auth trusted domains on the **development branch only**.

## 5. First-institution bootstrap

The API does not enable first-organization setup unless a one-time SHA-256 digest is configured.

1. Generate the one-time token locally from the repository root with `node scripts/create-bootstrap-token.mjs`.
2. Keep the raw token private; do not paste it into chat, GitHub, or logs.
3. Add only the 64-character SHA-256 digest as a temporary GitHub Actions repository secret named `PONDOK_BOOTSTRAP_TOKEN_SHA256`.
4. Run **Deploy PONDOK OS API to Neon Development** again with `DEPLOY_DEV_API`.
5. Use the raw token once in the first-setup screen after the web workspace is live.
6. Immediately delete the `PONDOK_BOOTSTRAP_TOKEN_SHA256` GitHub secret and redeploy the API without it.
7. Verify that a second bootstrap attempt is rejected and that the owner can sign in.

The deployment script validates the digest format and never prints its value. Do not set this secret before the API and web workspace are ready for first setup.

## 6. Remaining gates after hosting

Hosting the API and static workspace does not activate database RLS or initialize an institution.

- Deploy the matching API build first. This is required because the API sets transaction-local tenant context.
- Apply migration 0013 to the development branch using the repository migration runner, then verify all 59 protected tables have ENABLE + FORCE RLS.
- Verify live Neon Auth sign-in, owner bootstrap and two-tenant isolation.
- Do not apply the migration or deploy this workflow to `br-late-cherry-b3uqtuvh` (production) without a separate production-readiness approval.

## Free-plan note

This path avoids adding a separate paid application host, but it is not unlimited. Neon Functions and Neon Postgres remain subject to the active Neon plan's usage limits. Monitor project usage before onboarding real institutions.
