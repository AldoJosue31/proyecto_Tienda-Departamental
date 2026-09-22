-- Logistics does not own the sale, but it needs an immutable channel snapshot
-- to make its own projection rules explicit. Existing rows predate the field,
-- so they remain NULL instead of being guessed as online or physical.
ALTER TABLE logistics_shipments
  ADD COLUMN IF NOT EXISTS channel VARCHAR(16) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'logistics_shipments_channel_valid'
  ) THEN
    ALTER TABLE logistics_shipments
      ADD CONSTRAINT logistics_shipments_channel_valid
      CHECK (channel IS NULL OR channel IN ('ONLINE', 'PHYSICAL'));
  END IF;
END;
$$;
