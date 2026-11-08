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
| Neon Function `pondokapi` | Development deployment workflow #45 completed successfully | GitHub Actions deployment run |
| Function runtime | Node.js 24 | Neon Function metadata |
| Function environment includes health encryption key | Yes | Environment variable names only |
| Function environment includes identity encryption key | No | Environment variable names only |

Development API deployment workflow #45 completed successfully. CI and Release Bundle also completed successfully for the relevant main commit. CI and bundle tests use disposable PostgreSQL; they are not live tenant acceptance.

## Migration ledger gap

The Development migration ledger now contains **26 applied migrations through 0026**. Migrations 0024, 0025, and 0026 were applied on Development on 2026-11-08 and are recorded in `core.schema_migrations`. The earlier statement that these migrations were pending is superseded. Live schema checks confirm that Procurement/Inventory, company HR/internal documents, and guardian-authority schema objects are present. Future migrations must use the repository migration runner and be applied only after review/approval.

## Security and operational blockers

1. **Identity-document encryption:** the API code expects `STUDENT_IDENTITY_ENCRYPTION_KEY` to decode from base64 to exactly 32 bytes. This variable is not present in the current Development Function environment. The endpoint must remain unavailable/fail-closed until a key is provisioned, securely backed up, and a rotation/recovery procedure exists.
2. **Health encryption:** `STUDENT_HEALTH_ENCRYPTION_KEY` and its version are present, but this audit did not inspect or expose secret values.
3. **No tenant acceptance data:** there are no organizations, memberships, student profiles, or employees. No fabricated tenant, user, guardian, student, or employee records were inserted.
4. **RLS is necessary, not sufficient:** 67/67 tenant tables enforce RLS, but API-level cross-tenant authorization still requires end-to-end tests with two legitimately provisioned test tenants.
5. **No Production change:** all live catalog and function checks in this audit targeted the Development branch. No production migration, deployment, or data write was performed.

## Required next steps

1. Keep migration ledger and live schema checks synchronized; the previous 0024–0026 pending note is resolved.
2. Provision the identity encryption key through an approved secret-management path. Keep the key out of source control, logs, and chat; retain a recoverable encrypted backup and documented rotation procedure.
3. Re-deploy the Development Function only after the environment update is safely prepared; verify liveness, readiness, and fail-closed identity-document behavior.
4. Run API-level two-tenant isolation tests and role/permission tests.
5. Provision the first real institution through Central Command using its authorized Super Administrator and actual institution details. Do not seed fake institutional data.
6. Run role-based end-to-end acceptance for the modules in the completion blueprint before declaring operational readiness.

## Readiness statement

PONDOK OS has a successfully built and deployed Development API foundation and broad tenant RLS coverage. Migrations 0024–0026 are now applied on Development. It is **not yet ready for live institutional operations**: the identity-document encryption key remains missing (last verified), no tenant exists, and two-tenant live acceptance has not been completed.

Additional Central Command inspection on 2026-11-08 found 80 tables in schema `platform`; 79 have RLS enabled and FORCE enabled. The one exception is `platform.super_admins`, the global platform control table, which must remain behind server-side Super Admin authorization. A separate Central Command menu audit documents transaction-capable versus read-only pages.
