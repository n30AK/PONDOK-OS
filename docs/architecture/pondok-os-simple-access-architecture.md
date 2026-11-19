# PONDOK OS — Simple Access Architecture

Status: proposed target architecture and implementation plan  
Audit baseline: `main` at `955c4d18bb2f6dfab6dec4acfbc50e6c21981471` (2026-11-19)  
Scope: identity, workspace routing, tenant membership, roles, permissions, and staff onboarding  
Safety boundary: this document changes no database schema, database records, Neon Auth users, secrets, or Production resources.

## 1. Problem statement

The current experience exposes too much authorization machinery to ordinary institution administrators. Users encounter institution membership, system roles, custom roles, permission matrices, and six different scope types. The concepts are individually valid, but the everyday task—giving a staff member access to their job—is more complicated than it should be.

The target is not to remove authorization controls. It is to move technical complexity behind safe defaults so that most administrators only need to invite a person, choose a job, and select the relevant unit.

## 2. Audit findings from the current main branch

The following findings are grounded in the current source tree:

1. `apps/web/src/App.tsx` currently owns authentication, platform-access checking, tenant discovery, workspace selection, navigation, and most tenant-screen routing in one large component.
2. The tenant application does not redirect a platform Super Administrator into Command Central. It resolves tenant memberships separately. A single authorized organization opens automatically; multiple organizations require a chooser; zero organizations produces a no-membership state.
3. The tenant UI currently exposes a broad navigation and access-management surface. The access screen is titled `Jabatan, Peran & Hak Akses` for managers and `Peran & Hak Akses Saya` for other members.
4. `apps/web/src/TenantAccessAdmin.tsx` combines member onboarding, system-role assignment, custom-role creation, a granular permission matrix, member role editing, and six scope types (campus, department, class, class-subject, dormitory, room) in one screen.
5. The current member-add flow is not an invitation flow. The UI posts an email and role keys to `POST /v1/tenant/members`; the API calls `core.add_tenant_member_by_email` and only accepts an existing, verified, non-banned account. An unregistered or unverified user receives `verified_account_not_found` and must first register and verify separately.
6. The current database function intentionally prevents tenant administrators from assigning `institution_owner` or `institution_admin` to ordinary members, and prevents self-role changes. Those protections must remain.
7. Tenant role and permission changes are already mediated by backend functions and permission checks. The new UX must preserve backend authorization, tenant isolation, audit events, and least-privilege behavior.
8. The public website is a separate website surface. It should remain a product discovery and activation funnel, not become another place where institution staff manage operational access.
9. The code comments identify Command Central as a separate application. The PONDOK OS tenant workspace must not expose Command Central controls or infer platform authority from tenant roles.

## 3. Target user experience

### One identity, separate workspaces

- One sign-in identity is used for the user's authorized workspaces.
- After authentication, the server returns the workspaces the identity is actually authorized to enter.
- One authorized workspace opens automatically.
- Multiple authorized workspaces show a small workspace chooser.
- No authorized workspace shows one clear next step: request an invitation from the institution administrator, or apply for institution activation if the user is establishing a new institution.
- Platform authority and tenant authority remain independent. A platform Super Admin does not automatically become an institution owner, and a tenant owner does not automatically gain Command Central access.

### Three clearly separated product surfaces

| Surface | Purpose | Audience |
|---|---|---|
| AKVISIO public website | Product information, demo, consultation, activation request | Prospective and existing customers |
| AKVISIO Command Central | Customer registry, activation approval, licensing, platform operations | Explicitly authorized AKVISIO platform staff |
| PONDOK OS | Daily pesantren operations | Authorized members of each pesantren |

### Simple staff onboarding

The default administrator workflow should be:

1. Open **Pengguna**.
2. Select **Undang pengguna**.
3. Enter name and email (phone can be optional).
4. Choose a predefined job template, such as Guru/Ustaz, Keuangan, Pengasuh Asrama, Perpustakaan, or PPDB.
5. Select a unit or work scope only when needed.
6. Send the invitation.
7. The invitee opens a time-limited, single-use invitation, verifies their identity, and sets their own password.

Administrators must never create or distribute another person's password. Invitation acceptance must not allow a user to choose or elevate their own tenant role.

### Advanced controls

- Keep custom roles and the detailed permission matrix under **Pengaturan lanjutan**.
- Most institutions should use predefined job templates without seeing permission keys.
- Unit/campus/class/asrama scopes should appear only when relevant to the selected job.
- Explain access in human language (what the person can see and do), not only technical permission strings.
- Provide a concise member list with name, job, unit, and status. Keep audit history available to authorized administrators.

## 4. Authorization invariants (must not regress)

1. The backend remains the source of truth. Hiding a menu is not authorization.
2. Platform roles authorize Command Central only. Tenant roles authorize only the specific tenant membership and assigned scope.
3. No privilege inheritance between platform and tenant roles.
4. Signup creates an identity, not a tenant membership.
5. Institution activation and owner assignment remain a separate, independently approved process.
6. No self-assignment, self-promotion, or self-approval.
7. Owner/admin protections and the independent Super Admin approval boundary remain intact.
8. Multiple job roles aggregate only within the same authorized tenant and scope, with least privilege.
9. Role, invitation, membership, and scope changes must be audited.
10. Invitation tokens must be single-use, expiring, securely stored, and bound to the intended email and tenant. Password setup happens through the identity provider's supported flow.
11. Revoking access must invalidate the effective tenant membership/session authorization promptly; do not rely on hiding a menu.
12. No direct writes to Neon Auth password hashes or privileged identity tables.

## 5. Implementation sequence

### Phase 0 — Architecture baseline (this PR)

- Record the current behavior and verified source-level constraints.
- Agree on the target separation and authorization invariants.
- Do not change database or authentication behavior.

### Phase 1 — Workspace boundaries and routing

- Separate workspace resolution from the tenant application shell.
- Keep public website, Command Central, and PONDOK OS entry points distinct.
- Use server-authorized workspace metadata to route users.
- Add explicit tests for platform-only, tenant-only, dual-authorized, multi-tenant, and no-membership identities.

### Phase 2 — Simple user and job management

- Replace the technical-first access screen with **Pengguna & Jabatan**.
- Make predefined job templates the primary assignment method.
- Move custom role and permission matrix controls behind advanced settings.
- Add human-readable summaries of access and assigned work scope.

### Phase 3 — Secure invitations

- Design and implement a tenant-bound invitation lifecycle using supported Neon Auth/identity-provider capabilities.
- Invitee verifies the intended email and sets their own password.
- Add expiration, one-time use, resend, cancellation, audit events, and abuse/rate controls.
- Do not ship a UI that implies invitation support until the backend lifecycle is implemented and tested.

### Phase 4 — Scope and membership lifecycle

- Simplify unit/scope assignment to only the dimensions relevant to a job.
- Implement safe member suspension/revocation and session invalidation.
- Preserve tenant isolation and prevent administrators from removing the last valid institution owner.
- Add audit and recovery paths.

### Phase 5 — Acceptance and rollout

- Run tests for privilege separation, tenant isolation, invitation lifecycle, role assignment, scope enforcement, and revocation.
- Verify behavior with at least two independently verified users and two tenants in Development.
- Run end-to-end tests for the real user journeys.
- Production rollout requires separate explicit approval and release-gate evidence.

## 6. Acceptance criteria

- A normal institution administrator can invite a staff member without asking them to register first.
- The invitee sets their own password; administrators never handle passwords.
- A normal job assignment requires no manual permission-key selection.
- Advanced permission controls remain available to authorized administrators but are not the default workflow.
- Users with one workspace enter it automatically; users with multiple workspaces see only their authorized choices.
- Platform-only users never receive tenant data access by virtue of their platform role.
- Tenant-only users never receive Command Central access by virtue of their tenant role.
- Every sensitive change is server-authorized, tenant-scoped, and audited.
- All acceptance tests pass on Development before any Production discussion.

## 7. Explicit exclusions and safety controls

- No Neon Production access or mutation.
- No Development database migration, schema change, seed, or data mutation in this architecture-baseline PR.
- No creation, promotion, revocation, or password reset of real users.
- No new Super Admin.
- No claims that secure invitations or revocation are available until their full backend lifecycle is implemented and verified.
- Commercial release status remains governed by the existing readiness and acceptance gates.

## 8. Next engineering deliverables

1. A focused workspace-boundary refactor with routing tests.
2. A simplified **Pengguna & Jabatan** interface using existing safe role templates.
3. A separately reviewed invitation design, including any required Development-only migration and supported Auth integration.
4. Backend acceptance tests proving the authorization invariants above.
