CREATE TABLE IF NOT EXISTS orders_outbox_events (
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
  CONSTRAINT orders_outbox_event_type_not_blank CHECK (length(trim(event_type)) > 0),
  CONSTRAINT orders_outbox_delivery_attempts_nonnegative CHECK (delivery_attempts >= 0)
);

CREATE INDEX IF NOT EXISTS orders_outbox_pending_idx
  ON orders_outbox_events (available_at ASC, occurred_at ASC)
  WHERE published_at IS NULL;
