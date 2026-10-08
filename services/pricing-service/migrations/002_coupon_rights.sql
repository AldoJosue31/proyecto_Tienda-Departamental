CREATE TABLE IF NOT EXISTS pricing_coupon_campaigns (
  id UUID PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  definition_hash VARCHAR(64) NOT NULL,
  discount_type VARCHAR(16) NOT NULL CHECK (discount_type IN ('PERCENTAGE','FIXED')),
  discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
  target_scope VARCHAR(16) NOT NULL CHECK (target_scope IN ('ALL','CATEGORY','PRODUCT','VARIANT')),
  target_id UUID NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pricing_coupon_rights (
  campaign_id UUID NOT NULL REFERENCES pricing_coupon_campaigns(id),
  customer_id UUID NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','RESERVED','USED')),
  order_id UUID NULL,
  request_hash VARCHAR(64) NULL,
  prices JSONB NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id,customer_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pricing_coupon_order_idx ON pricing_coupon_rights(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pricing_coupon_recovery_idx ON pricing_coupon_rights(checked_at) WHERE status IN ('RESERVED','USED');
