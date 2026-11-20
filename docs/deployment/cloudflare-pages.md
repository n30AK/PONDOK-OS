# Cloudflare Pages deployment

PONDOK OS is a pnpm monorepo with separate Vite applications. Cloudflare Pages must build the web workspace and Command Center independently, then publish one static artifact. Do not run `wrangler deploy` from the monorepo root: that command targets Workers and does not describe this frontend deployment.

## Connect the canonical repository

Use **`n30AK/PONDOK-OS`** as the source repository. The similarly named `n30AK/pondok` repository is a Cloudflare-created source import/mirror and is not the canonical development repository. Keep GitHub changes and reviews in `n30AK/PONDOK-OS`.

## Pages build settings

- Framework preset: **None**
- Production branch: keep the normal `main` branch for the eventual production release. During initial acceptance, use a separate Pages project or a staging production branch; do not point a public production deployment at Neon Development.
- Root directory: `/`
- Build command:

```bash
corepack enable && pnpm install --no-frozen-lockfile && node scripts/build-cloudflare-pages.mjs
```

- Build output directory: `apps/web/dist`
- Build environment: Node.js **22** (`NODE_VERSION=22`)

The build script:
1. Builds `@pondok-os/web` at the site root.
2. Builds `@pondok-os/command-center` with `/command-center/` as its Vite base path.
3. Publishes the Command Center under `/command-center/`.
4. Publishes the static marketing site under `/website/`.
5. Adds Pages SPA rewrites and baseline security/cache headers.

## Environment variables

Set these in the **Preview** environment first, using only the Neon Development branch:

- `VITE_API_URL`: the HTTPS invocation URL of the Neon Development API Function (not a database connection string).
- `VITE_NEON_AUTH_URL`: the Neon Managed Auth URL for the same Development branch.
- `VITE_SUPPORT_WHATSAPP_NUMBER`: optional public company WhatsApp number in international digits only.

These are public build-time frontend settings. Never put database URLs, passwords, Neon API keys, Cloudflare API tokens, signing keys, or other secrets in `VITE_*` variables. Any `VITE_*` value is embedded in browser assets.

Do not configure Production environment variables or switch the Pages production branch to `main` for live use until Neon Production has separately passed release acceptance and the Production API/Auth endpoints are explicitly approved. This change does not deploy or migrate the API or database.

## Acceptance checks

After a Preview deployment:
- `/` loads the institution workspace and its static assets.
- `/command-center/` loads the separate Command Center bundle.
- `/website/` loads the public marketing site and its images/styles.
- Direct refresh on nested client routes works.
- Sign-in and API calls use only the matching Neon Development endpoints.
- Neon Development CORS allows the exact Pages preview origin.
- Neon Auth Development trusted domains include the exact Pages preview origin.
- No tenant data, auth secrets, or server credentials are included in downloaded frontend assets.

A successful Pages build alone is not proof of authentication, API connectivity, tenant isolation, or production readiness.
