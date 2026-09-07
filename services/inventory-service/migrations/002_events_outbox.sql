ALTER TYPE inventory_movement_type ADD VALUE IF NOT EXISTS 'ORDER_CANCELLATION_RESTOCK';

CREATE TABLE IF NOT EXISTS inventory_outbox_events (
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
  CONSTRAINT inventory_outbox_event_type_not_blank CHECK (length(trim(event_type)) > 0),
  CONSTRAINT inventory_outbox_delivery_attempts_nonnegative CHECK (delivery_attempts >= 0)
);

CREATE INDEX IF NOT EXISTS inventory_outbox_pending_idx
  ON inventory_outbox_events (available_at ASC, occurred_at ASC)
  WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory_processed_events (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(120) NOT NULL,
  producer VARCHAR(80) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_processed_events_type_not_blank CHECK (length(trim(event_type)) > 0),
  CONSTRAINT inventory_processed_events_producer_not_blank CHECK (length(trim(producer)) > 0)
);
