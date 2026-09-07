CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS crm_customers (
  customer_id UUID PRIMARY KEY,
  first_purchase_at TIMESTAMPTZ NOT NULL,
  last_purchase_at TIMESTAMPTZ NOT NULL,
  completed_orders INTEGER NOT NULL CHECK (completed_orders > 0),
  lifetime_total NUMERIC(14, 2) NOT NULL CHECK (lifetime_total >= 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crm_customers_inactive_idx ON crm_customers (last_purchase_at ASC);

CREATE TABLE IF NOT EXISTS crm_purchase_projections (
  order_id UUID PRIMARY KEY,
  customer_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  purchased_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'CANCELLED')),
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crm_purchase_customer_history_idx ON crm_purchase_projections (customer_id, purchased_at DESC);

CREATE TABLE IF NOT EXISTS crm_purchase_item_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES crm_purchase_projections(order_id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  variant_label VARCHAR(360) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, variant_id)
);
CREATE INDEX IF NOT EXISTS crm_purchase_items_order_idx ON crm_purchase_item_snapshots (order_id);

CREATE TABLE IF NOT EXISTS crm_processed_events (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(120) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  correlation_id VARCHAR(128) NULL,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A cancellation may arrive before its completion event. The local ledger
-- prevents an out-of-order delivery from reintroducing that purchase.
CREATE TABLE IF NOT EXISTS crm_cancelled_orders (
  order_id UUID PRIMARY KEY,
  cancelled_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION crm_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_customers_set_updated_at_trigger ON crm_customers;
CREATE TRIGGER crm_customers_set_updated_at_trigger
BEFORE UPDATE ON crm_customers
FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

DROP TRIGGER IF EXISTS crm_purchase_projections_set_updated_at_trigger ON crm_purchase_projections;
CREATE TRIGGER crm_purchase_projections_set_updated_at_trigger
BEFORE UPDATE ON crm_purchase_projections
FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();
