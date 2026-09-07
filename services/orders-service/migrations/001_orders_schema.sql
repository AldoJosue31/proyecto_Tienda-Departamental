CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE orders_status AS ENUM ('PENDING', 'RESERVED', 'CONFIRMED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_by_role VARCHAR(16) NOT NULL,
  branch_id UUID NOT NULL,
  status orders_status NOT NULL DEFAULT 'PENDING',
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cancellation_reason VARCHAR(500) NULL,
  cancelled_by UUID NULL,
  cancelled_by_role VARCHAR(16) NULL,
  cancelled_at TIMESTAMPTZ NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_role_valid CHECK (created_by_role IN ('ADMIN', 'EMPLOYEE', 'CUSTOMER')),
  CONSTRAINT orders_cancel_role_valid CHECK (
    cancelled_by_role IS NULL OR cancelled_by_role IN ('ADMIN', 'EMPLOYEE', 'CUSTOMER')
  ),
  CONSTRAINT orders_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT orders_money_nonnegative CHECK (
    subtotal >= 0 AND discount_total >= 0 AND total >= 0
  ),
  CONSTRAINT orders_total_consistent CHECK (total = subtotal - discount_total),
  CONSTRAINT orders_version_positive CHECK (version >= 1)
);

-- Product, category, variant, branch and reservation IDs are logical references
-- owned by Catalog, Inventory and the branch domain; Orders never adds cross-DB FKs.
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  category_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  variant_label VARCHAR(360) NOT NULL,
  quantity INTEGER NOT NULL,
  list_unit_price NUMERIC(12, 2) NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  line_discount_total NUMERIC(12, 2) NOT NULL,
  line_total NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  reservation_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_money_nonnegative CHECK (
    list_unit_price >= 0 AND unit_price >= 0 AND line_discount_total >= 0 AND line_total >= 0
  ),
  CONSTRAINT order_items_price_not_above_list CHECK (unit_price <= list_unit_price),
  CONSTRAINT order_items_total_consistent CHECK (
    line_total = unit_price * quantity
    AND line_discount_total = (list_unit_price - unit_price) * quantity
  ),
  CONSTRAINT order_items_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT order_items_order_variant_key UNIQUE (order_id, variant_id)
);

CREATE TABLE IF NOT EXISTS orders_idempotency (
  actor_id UUID NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  outcome_code VARCHAR(80) NULL,
  outcome_message VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_id, idempotency_key),
  CONSTRAINT orders_idempotency_key_not_blank CHECK (length(trim(idempotency_key)) > 0)
);

CREATE TABLE IF NOT EXISTS orders_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  actor_id UUID NULL,
  actor_role VARCHAR(16) NULL,
  action VARCHAR(80) NOT NULL,
  correlation_id VARCHAR(128) NULL,
  result VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_audit_role_valid CHECK (
    actor_role IS NULL OR actor_role IN ('ADMIN', 'EMPLOYEE', 'CUSTOMER')
  ),
  CONSTRAINT orders_audit_action_not_blank CHECK (length(trim(action)) > 0),
  CONSTRAINT orders_audit_result_not_blank CHECK (length(trim(result)) > 0)
);

CREATE INDEX IF NOT EXISTS orders_customer_history_idx
  ON orders (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_operations_idx
  ON orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS order_items_reservation_idx
  ON order_items (reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION orders_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_set_updated_at_trigger ON orders;
CREATE TRIGGER orders_set_updated_at_trigger
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION orders_set_updated_at();

DROP TRIGGER IF EXISTS orders_idempotency_set_updated_at_trigger ON orders_idempotency;
CREATE TRIGGER orders_idempotency_set_updated_at_trigger
BEFORE UPDATE ON orders_idempotency
FOR EACH ROW
EXECUTE FUNCTION orders_set_updated_at();
