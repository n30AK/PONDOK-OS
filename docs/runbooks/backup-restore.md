# PostgreSQL backup and restore drill

The application does not yet automate backups. Until an institution-specific backup job and retention policy are deployed, the database operator remains responsible for backups.

## Logical backup

Use a secure host with PostgreSQL client tools. Keep the connection URL in an environment variable or secret manager; do not put it in shell history.

```bash
export DATABASE_URL='postgresql://...'
pg_dump --format=custom --no-owner --no-acl --file=pondok-backup.dump "$DATABASE_URL"
sha256sum pondok-backup.dump > pondok-backup.dump.sha256
```

Encrypt the backup before moving it off-host. Restrict access to the backup and its encryption key separately.

## Restore to a separate test database

```bash
createdb pondok_restore_test
pg_restore --no-owner --no-acl --dbname=pondok_restore_test pondok-backup.dump
```

Run integrity checks:

```sql
SELECT COUNT(*) FROM core.organizations;
SELECT COUNT(*) FROM core.campuses;
SELECT COUNT(*) FROM academic.student_profiles;
SELECT COUNT(*) FROM finance.journal_entries;
SELECT COUNT(*) FROM inventory.stock_movements;
SELECT version, migration_name FROM core.schema_migrations ORDER BY version;
```

The expected counts must be compared with the source backup metadata. These commands are examples; tables may be empty on a newly provisioned institution.

## Drill requirements

- Record backup timestamp, database branch/identifier, backup checksum, operator and restore duration.
- Confirm all expected schemas and constraints exist.
- Confirm Neon Auth branch identity is available separately; restoring application tables alone does not restore a managed identity endpoint.
- Never restore over production during a drill.
- Delete temporary restore databases only after preserving the drill evidence and obtaining operator approval.
