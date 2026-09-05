CREATE TABLE IF NOT EXISTS crm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  request_key VARCHAR(200) NOT NULL,
  segment_months INTEGER NOT NULL CHECK (segment_months BETWEEN 1 AND 60),
  coupon_code VARCHAR(64) NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  target_count INTEGER NOT NULL CHECK (target_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (created_by, request_key)
);
CREATE INDEX IF NOT EXISTS crm_campaigns_created_at_idx ON crm_campaigns (created_at DESC);

CREATE TABLE IF NOT EXISTS crm_campaign_recipients (
  campaign_id UUID NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'UNDELIVERABLE')),
  notification_id UUID NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  failure_code VARCHAR(64) NULL,
  sent_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, customer_id)
);
CREATE INDEX IF NOT EXISTS crm_campaign_recipients_status_idx ON crm_campaign_recipients (campaign_id, status);

CREATE TABLE IF NOT EXISTS crm_campaign_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  event_type VARCHAR(120) NOT NULL CHECK (event_type = 'coupon.email.requested.v1'),
  correlation_id VARCHAR(128) NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL,
  locked_by VARCHAR(160) NULL,
  locked_until TIMESTAMPTZ NULL,
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_error VARCHAR(500) NULL,
  UNIQUE (campaign_id, customer_id)
);
CREATE INDEX IF NOT EXISTS crm_campaign_outbox_pending_idx ON crm_campaign_outbox_events (available_at ASC, occurred_at ASC) WHERE published_at IS NULL;

DROP TRIGGER IF EXISTS crm_campaigns_set_updated_at_trigger ON crm_campaigns;
CREATE TRIGGER crm_campaigns_set_updated_at_trigger
BEFORE UPDATE ON crm_campaigns
FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

DROP TRIGGER IF EXISTS crm_campaign_recipients_set_updated_at_trigger ON crm_campaign_recipients;
CREATE TRIGGER crm_campaign_recipients_set_updated_at_trigger
BEFORE UPDATE ON crm_campaign_recipients
FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();
