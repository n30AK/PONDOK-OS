-- Operational workflow permissions and inventory negative-stock guard.
BEGIN;

INSERT INTO core.permissions (permission_key, description) VALUES
 ('finance.periods.manage','Create and manage open financial periods')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO core.role_permissions (role_id, permission_key)
SELECT r.id, 'finance.periods.manage'
FROM core.roles r
WHERE r.organization_id IS NULL AND r.role_key IN ('institution_owner','institution_admin','finance_admin')
ON CONFLICT (role_id, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION inventory.guard_nonnegative_stock()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_balance numeric(18,3);
BEGIN
  IF NEW.movement_type IN ('issue','transfer_out') THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.organization_id::text || ':' || NEW.item_id::text || ':' || NEW.warehouse_id::text, 0)
    );
    SELECT COALESCE(SUM(
      CASE
        WHEN movement_type IN ('receipt','transfer_in','adjustment') THEN quantity
        WHEN movement_type IN ('issue','transfer_out') THEN -quantity
        ELSE 0
      END
    ),0)
    INTO current_balance
    FROM inventory.stock_movements
    WHERE organization_id = NEW.organization_id
      AND item_id = NEW.item_id
      AND warehouse_id = NEW.warehouse_id;
    IF current_balance < NEW.quantity THEN
      RAISE EXCEPTION 'insufficient stock: available %, requested %', current_balance, NEW.quantity
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inventory_guard_nonnegative_stock ON inventory.stock_movements;
CREATE TRIGGER trg_inventory_guard_nonnegative_stock
BEFORE INSERT ON inventory.stock_movements
FOR EACH ROW EXECUTE FUNCTION inventory.guard_nonnegative_stock();

COMMIT;
