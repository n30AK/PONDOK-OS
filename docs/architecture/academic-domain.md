# Academic domain foundation

Migration `0003_academic_domain_foundation.sql` introduces the first tenant-scoped academic records:

- Academic years and terms
- Programs and class groups
- Student profiles and guardian relationships
- Yearly student enrollments
- Subjects and class-subject assignments
- Attendance sessions and per-student attendance records

## Isolation and integrity

Every academic record carries `organization_id`. Composite foreign keys include the organization identifier so a row cannot reference a parent record from another organization. Campus-bound student and class records also reference the campus within the same organization.

The migration is additive. It does not alter Neon Auth, existing core tables, or the production branch.

## Explicit boundaries

This is a schema foundation, not a finished academic application. It does not yet provide API endpoints, user-to-student/guardian mapping, authorization policies, row-level security, gradebooks, report cards, timetable scheduling, promotion workflows, or UI screens. Sensitive personal/contact fields are intentionally limited until the data-protection and access-control layer is implemented.

Attendance is modeled as a session plus one record per student. The current schema prevents duplicate attendance entries for the same student in one session; service-level checks must still ensure that the student is enrolled in the class before attendance is accepted.

## Apply and verify

Apply this migration to an isolated development branch first. Record its exact file checksum in `core.schema_migrations` only when the migration runner/checksum process is in place; do not invent ledger entries.
