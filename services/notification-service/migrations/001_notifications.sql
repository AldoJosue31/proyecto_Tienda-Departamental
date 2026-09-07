CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS notification_received_events (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(120) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  coupon_code VARCHAR(64) NOT NULL,
  coupon_valid_until TIMESTAMPTZ NOT NULL,
  correlation_id VARCHAR(128) NULL,
  email VARCHAR(320) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'UNDELIVERABLE')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_retry_at TIMESTAMPTZ NULL,
  locked_until TIMESTAMPTZ NULL,
  provider_message_id VARCHAR(255) NULL,
  failure_code VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, customer_id)
);
CREATE INDEX IF NOT EXISTS notification_deliveries_retry_idx ON notification_deliveries (next_retry_at ASC) WHERE status = 'FAILED';

CREATE TABLE IF NOT EXISTS notification_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL,
  event_type VARCHAR(120) NOT NULL CHECK (event_type IN ('notification.sent.v1', 'notification.failed.v1')),
  correlation_id VARCHAR(128) NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL,
  locked_by VARCHAR(160) NULL,
  locked_until TIMESTAMPTZ NULL,
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_error VARCHAR(500) NULL,
  UNIQUE (notification_id, event_type)
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx ON notification_outbox_events (available_at ASC, occurred_at ASC) WHERE published_at IS NULL;

CREATE OR REPLACE FUNCTION notification_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS notification_deliveries_set_updated_at_trigger ON notification_deliveries;
CREATE TRIGGER notification_deliveries_set_updated_at_trigger BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION notification_set_updated_at();
