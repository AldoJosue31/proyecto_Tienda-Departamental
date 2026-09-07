-- Physical sales remain Orders transactions. Inventory is updated only by
-- Orders' reservation/commit contract, never by a browser posting a stock
-- movement directly.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS channel VARCHAR(16) NOT NULL DEFAULT 'ONLINE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_channel_valid'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_channel_valid CHECK (channel IN ('ONLINE', 'PHYSICAL'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_channel_operations_idx
  ON orders (channel, created_at DESC);
