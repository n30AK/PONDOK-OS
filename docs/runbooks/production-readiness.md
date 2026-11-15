# Production readiness gate

This checklist is intentionally strict. Do not promote a development build to production merely because CI is green.

## Current implementation boundaries (Development)

The following reflects code paths and CI/deployment evidence, not a production acceptance sign-off.

### Implemented scope enforcement

- Student and employee read/write paths have explicit tenant filters and member scope predicates for supported operations.
- Attendance is scoped to campus/class; class-subject-only attendance grants remain unsupported.
- Boarding records are scoped through campus, dormitory, room, bed and student assignment relationships.
- Payroll run reads and preparation filter employees by campus/department scope; approval and payment remain institution-authority-only.
- Inventory warehouse and stock-movement access is restricted to active campus grants; transfer authorization checks both warehouses.
- Procurement request/order and fixed-asset reads are campus-scoped where a request or asset has a campus relationship. Purchase orders without a linked campus request are hidden from scoped members.

### Intentionally fail-closed

- PPDB scoped officers may read admission periods and applicant records only for active campus grants. Creating/submitting applications, review decisions, enrollment conversion and related document writes remain denied until every lifecycle query and audit write has atomic campus authorization.
- Scoped finance members may read the chart of accounts and fiscal-period metadata with explicit permissions. Journal entries/lines, posting, period closing and all finance writes remain denied until a reliable campus/cost-center relationship exists.
- Scoped procurement members may create purchase requests for assigned campuses and add lines only to in-scope draft requests. Editing requests, creating/approving purchase orders, supplier writes and fixed-asset writes remain denied pending atomic authorization for every related supplier, request, order, item and approval transition.
- Scoped librarians may read the catalog, physical copies by campus and loans only when both copy-campus and borrower-student scopes match. Loan creation/return remain restricted. Student identity documents, health profiles and guardian-authority verification also remain restricted until their complete resource-specific scope and audit paths are verified.
- Unknown or unmapped generic module resources remain denied for scoped members. A visible menu or permission alone does not prove that the underlying API enforces scope.

### Additional release blockers

- The current payroll-run schema does not persist a preparer identity, so separation-of-duties/self-approval cannot be proven for payroll approval. A schema change requires a separately approved Development migration.
- Student identity document encryption requires STUDENT_IDENTITY_ENCRYPTION_KEY; without it, the API must fail closed.
- Backup automation, immutable/off-site retention and a completed restore drill are not yet evidenced.
- Real two-tenant login/API isolation, complete browser E2E, institution UAT, disaster recovery, incident response, retention/deletion workflows and regulatory/privacy review remain outstanding.
- Offline installer, full hybrid sync, native Android/iOS apps, kiosk/wall display and commercial Central Command are not production deliverables in the current repository snapshot.

## Identity and access

- [ ] Create a separate Neon production branch and enable/configure Neon Auth there.
- [ ] Register only the intended HTTPS application origin as a trusted domain.
- [ ] Configure production email delivery (custom SMTP) and test password recovery.
- [ ] Create institution users through a controlled onboarding process; no public self-sign-up.
- [ ] Bootstrap the first institution owner on the intended branch using the guarded CLI.
- [ ] Assign least-privilege roles; verify direct API requests are denied without permission.
- [x] Deploy the API build with transaction-scoped tenant context and `SET LOCAL ROLE pondok_runtime` before activating tenant RLS on Development.
- [x] Apply migrations 0013 and 0014 on Neon Development; verify ENABLE + FORCE RLS on 59 tenant tables, restricted runtime role (`NOLOGIN`, `NOBYPASSRLS`), and hardened membership-role/role-permission policies. Staging and CI isolation tests pass.
- [x] Review the live `core.organization_memberships` RLS policy set on Development: RLS ENABLE + FORCE is active, with platform-controlled insert and self/active-tenant or Super Admin read policies. This does not replace the still-pending two-tenant API isolation test.
- [ ] Verify tenant isolation through the live API with at least two independent user identities and organizations.
- [ ] Add campus-level authorization where required.
- [ ] Add rate limits, security logging and abuse monitoring.

## Database and data protection

- [ ] Reconcile manually created development objects with the migration ledger before using `db:migrate`.
- [ ] Review each migration against a restored staging snapshot.
- [ ] Configure encrypted backups and retention.
- [ ] Complete a restore drill to a separate database and verify row counts and key relationships.
- [ ] Define student, guardian, HR, financial and incident-record retention rules.
- [ ] Verify no secrets or personal data are present in logs, fixtures or build artifacts.

## Application and deployment

- [ ] Set `NODE_ENV=production`.
- [ ] Use matching `DATABASE_URL`, `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` from one branch.
- [ ] Put the web/API containers behind TLS and a hardened reverse proxy.
- [ ] Set resource limits, restart policy, log rotation and monitoring.
- [ ] Confirm `/health/live` and `/health/ready` behave as expected.
- [ ] Test sign-in, sign-out, session restore, expired token and disabled membership.
- [ ] Test student creation and tenant isolation with at least two organizations.
- [ ] Verify migration execution and rollback/restore strategy.

## Institution acceptance

- [ ] Import only approved, minimized test data.
- [ ] Validate academic year, program, class, student and guardian workflows.
- [ ] Validate finance journals balance and closed periods reject posting.
- [ ] Validate inventory ledger reconciliation and stock opname.
- [ ] Validate HR/payroll approval and correction workflows.
- [ ] Train administrators and document support escalation.

## Explicit exclusions from the current build

Local-only/offline deployment, full hybrid sync, mobile apps, desktop installer, kiosk and commercial Control Center are not production deliverables in the current repository snapshot.
