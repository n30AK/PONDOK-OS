# Production readiness gate

This checklist is intentionally strict. Do not promote a development build to production merely because CI is green.

## Identity and access

- [ ] Create a separate Neon production branch and enable/configure Neon Auth there.
- [ ] Register only the intended HTTPS application origin as a trusted domain.
- [ ] Configure production email delivery (custom SMTP) and test password recovery.
- [ ] Create institution users through a controlled onboarding process; no public self-sign-up.
- [ ] Bootstrap the first institution owner on the intended branch using the guarded CLI.
- [ ] Assign least-privilege roles; verify direct API requests are denied without permission.
- [ ] Deploy the API build with transaction-scoped tenant context before activating tenant RLS.
- [ ] Apply migration 0013 on a staging branch and verify ENABLE + FORCE RLS and the tenant policy on all 59 protected tables.
- [ ] Review and separately harden `core.organization_memberships`, which is intentionally excluded from migration 0013 as the membership authority.
- [ ] Verify tenant isolation with at least two independent user identities and organizations.
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
