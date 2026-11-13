# Audit API Tenant Scope & Student Update Route — 2026-11-13

**Branch inspected:** `main` at `a207deb76a9495c7693c15042ed1445e1c1b0032` (PR #209 documentation merge is subsequent to that baseline; runtime source files inspected were unchanged by the docs-only PR).  
**Method:** static source inspection and read-only Development schema findings. No database writes, migrations, user records, or secrets were changed.  
**Environment boundary:** Neon Production was not accessed.

## Executive result

The API has tenant-level authorization foundations: handlers resolve active membership and permissions, and the inspected tenant-owned SQL generally binds queries to the server-derived `organizationId`. This is not equivalent to member-level campus/class/subject/unit/dormitory authorization. The scope model in the blueprint is still absent from the runtime.

One concrete student-edit routing defect was identified and fixed in this branch: the academic handler previously rejected every path other than the collection URL before checking the item URL, making its documented `PATCH /v1/academic/students/:id` branch unreachable.

## Findings

### F-01 — Student PATCH route was unreachable
**Severity:** High functional defect.  
**Evidence:** `apps/api/src/academic.ts` previously returned `false` unless the pathname exactly equaled `/v1/academic/students`, then attempted to match `/v1/academic/students/:id`. The item path could never pass the first condition. The web client sends PATCH to the item path when editing an existing student (`apps/web/src/App.tsx`).  
**Disposition:** Fixed in this branch by introducing a single route matcher accepting only the collection path or a UUID item path, with regression tests for valid and invalid paths. CI must confirm the fix.

### F-02 — No member-level scope enforcement in inspected domain handlers
**Severity:** Critical authorization gap relative to intended teacher/TU/musyrif behavior.  
**Evidence:** `loadTenantContext` returns membership, roles and permissions but no scope assignments. `academic.ts`, `finance.ts`, `inventory.ts`, and `hr.ts` check permissions and use tenant-level `organization_id` predicates. For example, the student list selects all matching tenant student profiles; HR employee listing selects tenant employees; inventory movement listing selects tenant movements.  
**Impact:** A user with a broad read permission can query all records in the tenant (subject to the permission), not only the campus, class, subject, unit, warehouse, or dormitory assigned to that member. RLS tenant policies do not supply this missing per-member filter.  
**Disposition:** Do not attempt a UI-only fix. Requires approved Development schema design, central API scope resolver, per-domain query enforcement, RLS defense-in-depth, and negative tests.

### F-03 — Generic module resource reader returns `SELECT *`
**Severity:** High data-minimization concern.  
**Evidence:** `apps/api/src/module-records.ts` generic GET builds `SELECT * FROM <resource.table> WHERE organization_id=$1`. Resource permissions are checked, and selected guardian-authority fields are filtered for users without the special verification permission, but the generic query has no per-resource response allowlist and no member scope filter.  
**Impact:** New columns can become exposed automatically; broad student/employee/guardian resource permissions can return fields beyond what a screen needs.  
**Disposition:** Replace `SELECT *` with explicit field allowlists per resource, apply field-level permissions, and include member scope predicates before treating the module API as least-privilege.

### F-04 — Student option picker is tenant-wide
**Severity:** Medium authorization/data-minimization concern.  
**Evidence:** `GET /v1/modules/student-options` accepts a set of permissions that includes academic, boarding, and library read/write permissions, then returns up to 200 active/applicant students with student number and legal name filtered only by `organization_id`.  
**Impact:** Operational staff who need a borrower/boarding picker may receive a tenant-wide student directory, rather than only students relevant to their campus or assigned service area.  
**Disposition:** Apply scope-aware lookup and return the minimum display fields needed by each calling workflow.

### F-05 — HR employee list is campus-wide per tenant
**Severity:** Medium authorization/data-minimization concern.  
**Evidence:** `GET /v1/hr/employees` checks `hr.employees.read` and filters only by `organization_id`, while returning email and phone. The schema includes `campus_id`.  
**Impact:** HR readers cannot be constrained to assigned campuses/units; contact details are returned in the same list response.  
**Disposition:** Apply campus/unit scope and field-level permission/masking. Confirm which HR roles need contact fields.

### F-06 — Scope model needs concrete relational integrity before migration
**Severity:** Blocking design requirement.  
**Evidence:** The merged scope blueprint itself records that scope registry/foreign-key strategy, unit semantics, class-subject relationship, and room→dormitory→campus parent validation must be finalized before migration.  
**Disposition:** Complete a read-only FK/unique/index/trigger/RLS inventory for every candidate target and write the final migration proposal. No schema mutation is authorized by this audit.

## Domain endpoint inventory (static inspection)

| Domain | Inspected API file | Tenant predicate observed | Member scope observed |
|---|---|---|---|
| Students/academic | `apps/api/src/academic.ts` | Yes, `organization_id` | No |
| Finance/accounting | `apps/api/src/finance.ts` | Yes, `organization_id` on inspected list/write paths | No |
| Inventory/warehouse | `apps/api/src/inventory.ts` | Yes, `organization_id`; joined resources correlate organization IDs | No |
| HR/payroll | `apps/api/src/hr.ts` | Yes, `organization_id` | No |
| Generic module resources | `apps/api/src/module-records.ts` | Yes, `organization_id` | No |

This is a source-level inventory of the listed files, not proof that every endpoint, background job, export, or database policy has been exhaustively tested.

## Required next implementation sequence

1. Finalize and approve the exact Development-only scope schema after inspecting all foreign keys, unique constraints, indexes, triggers, and RLS policies.
2. Implement validated scope assignments and a server-side resolver; scope targets must be tenant-owned and parent/child-consistent.
3. Enforce permission AND scope in student, academic, boarding, library, HR, inventory, finance, procurement, asset, CRM and export paths as applicable.
4. Remove generic `SELECT *`; define response allowlists and field classifications.
5. Add negative tests for empty/expired/revoked scopes, cross-campus/class/subject/dormitory/unit access, forged IDs, and writes through relation pickers.
6. Complete UAT with real authorized accounts; do not fabricate accounts or memberships.

## Explicit non-actions

- No Neon schema migration or data mutation.
- No Production access or deployment.
- No new users, tenant memberships, or test PII.
- No weakening of tenant RLS, roles, permissions, or approval controls.
