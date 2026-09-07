CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE inventory_reservation_status AS ENUM (
    'RESERVED',
    'COMMITTED',
    'RELEASED',
    'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE inventory_movement_type AS ENUM (
    'RECEIPT',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'PHYSICAL_SALE',
    'RESERVATION_COMMIT',
    'RESERVATION_RELEASE',
    'RESERVATION_EXPIRE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS inventory_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_branches_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT inventory_branches_name_key UNIQUE (name)
);

-- This table is an Inventory-owned read projection, not a foreign key to
-- Catalog. It permits local operational reads while preserving database
-- ownership boundaries. Phase 6 will keep it synchronized from events.
CREATE TABLE IF NOT EXISTS inventory_variant_snapshots (
  variant_id UUID PRIMARY KEY,
  product_name VARCHAR(200) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  variant_label VARCHAR(360) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_variant_snapshots_product_name_not_blank
    CHECK (length(trim(product_name)) > 0),
  CONSTRAINT inventory_variant_snapshots_sku_not_blank
    CHECK (length(trim(sku)) > 0),
  CONSTRAINT inventory_variant_snapshots_label_not_blank
    CHECK (length(trim(variant_label)) > 0)
);

CREATE TABLE IF NOT EXISTS inventory_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES inventory_branches(id) ON DELETE RESTRICT,
  on_hand INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_stock_on_hand_nonnegative CHECK (on_hand >= 0),
  CONSTRAINT inventory_stock_reserved_nonnegative CHECK (reserved >= 0),
  CONSTRAINT inventory_stock_reserved_not_greater_than_on_hand CHECK (reserved <= on_hand),
  CONSTRAINT inventory_stock_reorder_point_nonnegative CHECK (
    reorder_point IS NULL OR reorder_point >= 0
  ),
  CONSTRAINT inventory_stock_variant_branch_key UNIQUE (variant_id, branch_id)
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES inventory_stock(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  order_id UUID NOT NULL,
  actor VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  quantity INTEGER NOT NULL,
  status inventory_reservation_status NOT NULL DEFAULT 'RESERVED',
  expires_at TIMESTAMPTZ NOT NULL,
  committed_at TIMESTAMPTZ NULL,
  released_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_reservations_quantity_positive CHECK (quantity > 0),
  CONSTRAINT inventory_reservations_actor_not_blank CHECK (length(trim(actor)) > 0),
  CONSTRAINT inventory_reservations_idempotency_key_not_blank
    CHECK (length(trim(idempotency_key)) > 0),
  CONSTRAINT inventory_reservations_actor_idempotency_key_key
    UNIQUE (actor, idempotency_key)
);

CREATE TABLE IF NOT EXISTS inventory_reservation_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES inventory_reservations(id) ON DELETE RESTRICT,
  actor VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  operation VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_reservation_operations_operation_valid
    CHECK (operation IN ('COMMIT', 'RELEASE')),
  CONSTRAINT inventory_reservation_operations_actor_not_blank CHECK (length(trim(actor)) > 0),
  CONSTRAINT inventory_reservation_operations_idempotency_key_not_blank
    CHECK (length(trim(idempotency_key)) > 0),
  CONSTRAINT inventory_reservation_operations_actor_idempotency_key_key
    UNIQUE (actor, idempotency_key),
  CONSTRAINT inventory_reservation_operations_reservation_operation_key
    UNIQUE (reservation_id, operation)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES inventory_stock(id) ON DELETE RESTRICT,
  type inventory_movement_type NOT NULL,
  quantity INTEGER NOT NULL,
  on_hand_delta INTEGER NOT NULL,
  reserved_delta INTEGER NOT NULL DEFAULT 0,
  reason VARCHAR(500) NULL,
  actor_id UUID NULL,
  actor_role VARCHAR(16) NULL,
  correlation_id VARCHAR(128) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_movements_quantity_positive CHECK (quantity > 0),
  CONSTRAINT inventory_movements_actor_role_valid CHECK (
    actor_role IS NULL OR actor_role IN ('ADMIN', 'EMPLOYEE', 'CUSTOMER')
  )
);

CREATE TABLE IF NOT EXISTS inventory_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NULL,
  actor_role VARCHAR(16) NULL,
  action VARCHAR(80) NOT NULL,
  stock_id UUID NULL REFERENCES inventory_stock(id) ON DELETE SET NULL,
  correlation_id VARCHAR(128) NULL,
  result VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_audit_log_action_not_blank CHECK (length(trim(action)) > 0),
  CONSTRAINT inventory_audit_log_result_not_blank CHECK (length(trim(result)) > 0),
  CONSTRAINT inventory_audit_log_actor_role_valid CHECK (
    actor_role IS NULL OR actor_role IN ('ADMIN', 'EMPLOYEE', 'CUSTOMER')
  )
);

CREATE INDEX IF NOT EXISTS inventory_stock_branch_idx
  ON inventory_stock (branch_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS inventory_stock_low_stock_idx
  ON inventory_stock (branch_id, updated_at DESC)
  WHERE reorder_point IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_reservations_active_expiration_idx
  ON inventory_reservations (expires_at ASC)
  WHERE status = 'RESERVED';

CREATE INDEX IF NOT EXISTS inventory_movements_stock_created_idx
  ON inventory_movements (stock_id, created_at DESC);

CREATE OR REPLACE FUNCTION inventory_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_branches_set_updated_at ON inventory_branches;
CREATE TRIGGER inventory_branches_set_updated_at
BEFORE UPDATE ON inventory_branches
FOR EACH ROW
EXECUTE FUNCTION inventory_set_updated_at();

DROP TRIGGER IF EXISTS inventory_variant_snapshots_set_updated_at
  ON inventory_variant_snapshots;
CREATE TRIGGER inventory_variant_snapshots_set_updated_at
BEFORE UPDATE ON inventory_variant_snapshots
FOR EACH ROW
EXECUTE FUNCTION inventory_set_updated_at();

DROP TRIGGER IF EXISTS inventory_stock_set_updated_at ON inventory_stock;
CREATE TRIGGER inventory_stock_set_updated_at
BEFORE UPDATE ON inventory_stock
FOR EACH ROW
EXECUTE FUNCTION inventory_set_updated_at();

DROP TRIGGER IF EXISTS inventory_reservations_set_updated_at ON inventory_reservations;
CREATE TRIGGER inventory_reservations_set_updated_at
BEFORE UPDATE ON inventory_reservations
FOR EACH ROW
EXECUTE FUNCTION inventory_set_updated_at();
