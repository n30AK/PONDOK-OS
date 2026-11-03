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

The deployment and activation workflows hardcode the development project and branch. Do not change them to the production branch as part of a routine deploy.

## 1. Add the scoped deployment credential

The development activation workflow needs a Neon API key. Create a **project-scoped** key for project `frosty-cherry-92983148` in Neon Console → Account / Developer Settings → API Keys.

A project-scoped key is still powerful inside its project; it can manage project resources and branches. Keep it out of source files and never paste it into chat or logs.

Add it to GitHub:

1. Open repository Settings → Secrets and variables → Actions.
2. Select **New repository secret**.
3. Name: `NEON_API_KEY`.
4. Value: the project-scoped key.
5. Do not create a plain repository variable for this credential.

## 2. Activate the development API and database

1. Open repository Actions.
2. Select **Activate PONDOK OS Neon Development**.
3. Choose **Run workflow**.
4. Enter exactly `ACTIVATE_NEON_DEV` in the confirmation field.
5. Wait for the workflow to finish.

The workflow deploys the Node.js 24 API function first, provisions the restricted `pondok_app` login role, applies pending migrations using the repository migration runner, obtains the restricted role's pooled connection URI, and updates the function environment. It targets only `br-proud-paper-b312lfxi`.

The API runtime uses `PONDOK_DATABASE_URL` for `pondok_app`. It intentionally ignores the automatically injected owner `DATABASE_URL`, because the managed owner role has `BYPASSRLS=true`. The migration runner alone uses the admin connection.

The workflow prints the public function invocation URL, but never prints database connection strings or the generated application-role password.

Verify the function URL:

```bash
curl -i https://<function-invocation-host>/health/live
curl -i https://<function-invocation-host>/health/ready
```

Expected: both endpoints return HTTP 200 after the activation workflow completes.

## 3. Enable GitHub Pages once

1. Open repository Settings → Pages.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Save the setting.

The repository includes a manual workflow named **PONDOK OS GitHub Pages**. It builds the web workspace with the project subpath and the selected development API/Auth URLs.

## 4. Deploy the web workspace

1. Open repository Actions.
2. Select **PONDOK OS GitHub Pages** → **Run workflow**.
3. Paste the Neon Function invocation URL printed by the activation workflow into `api_base_url` (without a trailing slash).
4. Keep the default Neon Auth URL unless the development branch/Auth integration is deliberately changed.
5. Run the workflow and open the resulting Pages URL.

The expected URL is `https://n30ak.github.io/PONDOK-OS/`. Add `https://n30ak.github.io` as a trusted domain in Neon Auth for the **development branch only** before testing sign-in.

## 5. First organization setup

The activation workflow does not set `PONDOK_BOOTSTRAP_TOKEN_SHA256`. First-organization setup remains disabled until the one-time bootstrap digest is configured securely in the Neon Function environment. Follow [the first-install runbook](../runbooks/first-install.md), then remove the digest immediately after setup.

## 6. Remaining acceptance gates

- Verify the runtime role reports `rolbypassrls=false` and `rolsuper=false`.
- Verify live Neon Auth sign-in, owner bootstrap and two-tenant isolation.
- Complete backup/restore, operational monitoring and institution workflow acceptance.
- Do not apply the migrations or deploy this workflow to `br-late-cherry-b3uqtuvh` (production) without a separate production-readiness approval.

## Free-plan note

This path avoids adding a separate paid application host, but it is not unlimited. Neon Functions and Neon Postgres remain subject to the active Neon plan's usage limits. Monitor project usage before onboarding real institutions.
