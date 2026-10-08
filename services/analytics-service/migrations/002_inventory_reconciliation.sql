ALTER TABLE analytics_inventory_projection ADD COLUMN revision BIGINT NOT NULL DEFAULT 0
  CHECK (revision BETWEEN 0 AND 9007199254740991);

CREATE TABLE analytics_inventory_sync (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  expected_rows INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
INSERT INTO analytics_inventory_sync (id) VALUES (TRUE);
