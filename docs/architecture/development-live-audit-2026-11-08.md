# PONDOK OS — Live Development Audit (2026-11-08)

**Scope:** Neon Development branch only  
**Project:** `frosty-cherry-92983148`  
**Branch:** `br-proud-paper-b312lfxi` (`development`)  
**Database:** `neondb`  
**Audit type:** read-only live catalog and deployment inspection  
**Production:** not queried for data and not modified

## Verified live state

| Check | Result | Evidence |
|---|---:|---|
| Development branch | Ready | Neon branch metadata |
| Tenant-owned tables with `organization_id` | 67 | Live PostgreSQL catalog query |
| Tenant-owned tables with RLS enabled and forced | 67/67 | `pg_class.relrowsecurity` + `relforcerowsecurity` |
| Organizations | 0 | Live count |
| Organization memberships | 0 | Live count |
| Student profiles | 0 | Live count |
| HR employees | 0 | Live count |
| Neon Function `pondokapi` | Deployment #42, completed | Neon Function metadata |
| Function runtime | Node.js 24 | Neon Function metadata |
| Function environment includes health encryption key | Yes | Environment variable names only |
| Function environment includes identity encryption key | No | Environment variable names only |

The latest Dev function deployment is #42. The previous Development deployment workflow run #42443473731 completed successfully, including the API liveness and readiness checks. The latest repository CI run #42448692662 and Release Bundle run #42448692609 also completed successfully. CI and bundle tests use disposable PostgreSQL; they are not live tenant acceptance.

## Migration ledger gap

The Development migration ledger currently contains versions through 0023. These repository migrations are present on `main` but are not recorded as applied in Development:

- `0024_procurement_inventory_foundation.sql`
- `0025_company_hr_internal_documents.sql`
- `0026_guardian_authority_verification.sql`

Live catalog checks confirm that the platform tables introduced by 0024 and 0025 are absent. Migration 0026's `academic.student_guardians.verified_by` column is also absent, and none of 0024–0026 is recorded in `core.schema_migrations`.

Migration 0026 must be applied before the guardian-authority verification endpoint can be considered operational on Development. Do not manually patch the schema outside the migration runner.

## Security and operational blockers

1. **Identity-document encryption:** the API code expects `STUDENT_IDENTITY_ENCRYPTION_KEY` to decode from base64 to exactly 32 bytes. This variable is not present in the current Development Function environment. The endpoint must remain unavailable/fail-closed until a key is provisioned, securely backed up, and a rotation/recovery procedure exists.
2. **Health encryption:** `STUDENT_HEALTH_ENCRYPTION_KEY` and its version are present, but this audit did not inspect or expose secret values.
3. **No tenant acceptance data:** there are no organizations, memberships, student profiles, or employees. No fabricated tenant, user, guardian, student, or employee records were inserted.
4. **RLS is necessary, not sufficient:** 67/67 tenant tables enforce RLS, but API-level cross-tenant authorization still requires end-to-end tests with two legitimately provisioned test tenants.
5. **No Production change:** all live catalog and function checks in this audit targeted the Development branch. No production migration, deployment, or data write was performed.

## Required next steps

1. Review migrations 0024–0026 and validate their complete ordered application on disposable PostgreSQL.
2. Obtain explicit approval before applying the prepared migrations to Development. Never apply them to Production.
3. Provision the identity encryption key through an approved secret-management path. Keep the key out of source control, logs, and chat; retain a recoverable encrypted backup and documented rotation procedure.
4. Re-deploy the Development Function only after the environment update is safely prepared; verify liveness, readiness, and fail-closed identity-document behavior.
5. Run API-level two-tenant isolation tests and role/permission tests.
6. Provision the first real institution through Central Command using its authorized Super Administrator and actual institution details. Do not seed fake institutional data.
7. Run role-based end-to-end acceptance for the modules in the completion blueprint before declaring operational readiness.

## Readiness statement

PONDOK OS has a successfully built and deployed Development API foundation and broad tenant RLS coverage. It is **not yet ready for live institutional operations**: migrations 0024–0026 are pending on Development, the identity-document encryption key is missing, no tenant exists, and two-tenant live acceptance has not been completed.
