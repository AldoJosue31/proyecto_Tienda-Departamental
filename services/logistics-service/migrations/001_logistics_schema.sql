CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS logistics_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE,
  customer_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  currency CHAR(3) NOT NULL,
  total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  items JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  version INTEGER NOT NULL DEFAULT 1,
  packed_at TIMESTAMPTZ NULL,
  shipped_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT logistics_shipments_status_valid CHECK (status IN ('PENDING', 'PACKING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  CONSTRAINT logistics_shipments_version_positive CHECK (version >= 1),
  CONSTRAINT logistics_shipments_currency_valid CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT logistics_shipments_items_array CHECK (jsonb_typeof(items) = 'array')
);
CREATE INDEX IF NOT EXISTS logistics_shipments_board_idx ON logistics_shipments (status, updated_at ASC) WHERE status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS logistics_shipments_branch_idx ON logistics_shipments (branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS logistics_shipment_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES logistics_shipments(id) ON DELETE RESTRICT,
  from_status VARCHAR(16) NULL,
  to_status VARCHAR(16) NOT NULL,
  actor_id UUID NULL,
  actor_role VARCHAR(16) NULL,
  correlation_id VARCHAR(128) NULL,
  source VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT logistics_shipment_transitions_status_valid CHECK (to_status IN ('PENDING', 'PACKING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  CONSTRAINT logistics_shipment_transitions_actor_role_valid CHECK (actor_role IS NULL OR actor_role IN ('ADMIN', 'EMPLOYEE', 'CUSTOMER')),
  CONSTRAINT logistics_shipment_transitions_source_valid CHECK (source IN ('ORDER_EVENT', 'OPERATIONS', 'SYSTEM'))
);
CREATE INDEX IF NOT EXISTS logistics_shipment_transitions_timeline_idx ON logistics_shipment_transitions (shipment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS logistics_processed_events (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(120) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  correlation_id VARCHAR(128) NULL,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A cancellation can reach the broker before the matching completion event.
-- Keep that fact locally so a later delivery can never re-open the shipment.
CREATE TABLE IF NOT EXISTS logistics_cancelled_orders (
  order_id UUID PRIMARY KEY,
  cancelled_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS logistics_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(120) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  correlation_id VARCHAR(128) NULL,
  payload JSONB NOT NULL,
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by VARCHAR(96) NULL,
  locked_until TIMESTAMPTZ NULL,
  published_at TIMESTAMPTZ NULL,
  last_error VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT logistics_outbox_event_type_not_blank CHECK (length(trim(event_type)) > 0),
  CONSTRAINT logistics_outbox_delivery_attempts_nonnegative CHECK (delivery_attempts >= 0)
);
CREATE INDEX IF NOT EXISTS logistics_outbox_pending_idx ON logistics_outbox_events (available_at ASC, occurred_at ASC) WHERE published_at IS NULL;

CREATE OR REPLACE FUNCTION logistics_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS logistics_shipments_set_updated_at_trigger ON logistics_shipments;
CREATE TRIGGER logistics_shipments_set_updated_at_trigger
BEFORE UPDATE ON logistics_shipments
FOR EACH ROW EXECUTE FUNCTION logistics_set_updated_at();
