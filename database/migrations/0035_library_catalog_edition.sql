-- Add an explicit edition field so labels distinguish editions of the same title.
-- Additive and tenant-safe: no existing catalog or copy records are rewritten.
BEGIN;
ALTER TABLE library.catalog_items
  ADD COLUMN IF NOT EXISTS edition text;
COMMENT ON COLUMN library.catalog_items.edition IS
  'Bibliographic edition/printing label shown on library copy labels and catalog records.';
COMMIT;
