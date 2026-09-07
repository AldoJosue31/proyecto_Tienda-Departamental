CREATE TABLE analytics_processed_events (
  event_id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  correlation_id TEXT NULL,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE analytics_branches (
  branch_id UUID PRIMARY KEY,
  branch_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE analytics_order_projection (
  order_id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES analytics_branches(branch_id),
  currency CHAR(3) NOT NULL,
  total NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  completed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'CANCELLED')),
  cancelled_at TIMESTAMPTZ NULL
);
CREATE INDEX analytics_order_projection_report_idx ON analytics_order_projection (status, currency, completed_at, branch_id);

CREATE TABLE analytics_order_item_projection (
  order_id UUID NOT NULL REFERENCES analytics_order_projection(order_id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(14,2) NOT NULL CHECK (line_total >= 0),
  PRIMARY KEY (order_id, variant_id)
);
CREATE INDEX analytics_order_item_top_idx ON analytics_order_item_projection (product_id, variant_id);

CREATE TABLE analytics_cancelled_orders (
  order_id UUID PRIMARY KEY,
  cancelled_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE analytics_inventory_projection (
  variant_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES analytics_branches(branch_id),
  on_hand INTEGER NOT NULL CHECK (on_hand >= 0),
  reserved INTEGER NOT NULL CHECK (reserved >= 0),
  available INTEGER NOT NULL CHECK (available >= 0 AND available = on_hand - reserved),
  last_updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (variant_id, branch_id)
);
CREATE INDEX analytics_inventory_branch_idx ON analytics_inventory_projection (branch_id, last_updated_at DESC);
