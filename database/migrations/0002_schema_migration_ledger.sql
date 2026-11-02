-- PONDOK OS / Migration ledger bootstrap
-- Additive and scoped to the development branch during Sprint 1.
BEGIN;

CREATE TABLE IF NOT EXISTS core.schema_migrations (
  version varchar(32) PRIMARY KEY,
  migration_name text NOT NULL,
  checksum_sha256 char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT current_user
);

COMMENT ON TABLE core.schema_migrations IS
  'Applied database migration history. Migration records are append-only and must not be edited manually.';

COMMIT;
