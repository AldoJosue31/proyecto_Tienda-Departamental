CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE pricing_promotion_status AS ENUM (
    'DRAFT',
    'SCHEDULED',
    'ACTIVE',
    'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE pricing_discount_type AS ENUM ('PERCENTAGE', 'FIXED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE pricing_target_scope AS ENUM ('ALL', 'PRODUCT', 'CATEGORY', 'VARIANT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pricing_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  status pricing_promotion_status NOT NULL DEFAULT 'SCHEDULED',
  discount_type pricing_discount_type NOT NULL,
  discount_value NUMERIC(12, 2) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_promotions_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT pricing_promotions_valid_window CHECK (starts_at < ends_at),
  CONSTRAINT pricing_promotions_discount_positive CHECK (discount_value > 0),
  CONSTRAINT pricing_promotions_percentage_limit CHECK (
    discount_type <> 'PERCENTAGE' OR discount_value <= 100
  ),
  CONSTRAINT pricing_promotions_priority_range CHECK (priority BETWEEN 0 AND 1000),
  CONSTRAINT pricing_promotions_timezone_not_blank CHECK (length(trim(timezone)) > 0)
);

-- Cross-domain product, category and variant IDs are logical references. Pricing
-- is their owner only for promotion rules; Catalog owns product data.
CREATE TABLE IF NOT EXISTS pricing_promotion_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES pricing_promotions(id) ON DELETE CASCADE,
  scope pricing_target_scope NOT NULL,
  target_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_promotion_targets_reference_shape CHECK (
    (scope = 'ALL' AND target_id IS NULL)
    OR (scope <> 'ALL' AND target_id IS NOT NULL)
  ),
  CONSTRAINT pricing_promotion_targets_scope_target_key
    UNIQUE NULLS NOT DISTINCT (promotion_id, scope, target_id)
);

CREATE TABLE IF NOT EXISTS pricing_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NULL REFERENCES pricing_promotions(id) ON DELETE SET NULL,
  actor_id UUID NULL,
  actor_role VARCHAR(16) NULL,
  action VARCHAR(80) NOT NULL,
  correlation_id VARCHAR(128) NULL,
  result VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_audit_log_action_not_blank CHECK (length(trim(action)) > 0),
  CONSTRAINT pricing_audit_log_result_not_blank CHECK (length(trim(result)) > 0),
  CONSTRAINT pricing_audit_log_actor_role_valid CHECK (
    actor_role IS NULL OR actor_role IN ('ADMIN', 'EMPLOYEE', 'CUSTOMER')
  )
);

CREATE INDEX IF NOT EXISTS pricing_promotions_status_window_idx
  ON pricing_promotions (status, starts_at ASC, ends_at ASC);

CREATE INDEX IF NOT EXISTS pricing_promotion_targets_lookup_idx
  ON pricing_promotion_targets (scope, target_id, promotion_id);

CREATE OR REPLACE FUNCTION pricing_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pricing_promotions_set_updated_at ON pricing_promotions;
CREATE TRIGGER pricing_promotions_set_updated_at
BEFORE UPDATE ON pricing_promotions
FOR EACH ROW
EXECUTE FUNCTION pricing_set_updated_at();
