CREATE TABLE IF NOT EXISTS logistics_couriers (
  id UUID PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  last_latitude NUMERIC(9, 6) NULL,
  last_longitude NUMERIC(9, 6) NULL,
  last_location_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT logistics_couriers_display_name_not_blank CHECK (length(trim(display_name)) > 0),
  CONSTRAINT logistics_couriers_latitude_valid CHECK (last_latitude IS NULL OR last_latitude BETWEEN -90 AND 90),
  CONSTRAINT logistics_couriers_longitude_valid CHECK (last_longitude IS NULL OR last_longitude BETWEEN -180 AND 180),
  CONSTRAINT logistics_couriers_location_complete CHECK (
    (last_latitude IS NULL AND last_longitude IS NULL AND last_location_at IS NULL)
    OR (last_latitude IS NOT NULL AND last_longitude IS NOT NULL AND last_location_at IS NOT NULL)
  )
);

ALTER TABLE logistics_shipments
  ADD COLUMN IF NOT EXISTS courier_id UUID NULL REFERENCES logistics_couriers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_address VARCHAR(500) NULL;

CREATE INDEX IF NOT EXISTS logistics_shipments_courier_idx
  ON logistics_shipments (courier_id, updated_at DESC)
  WHERE courier_id IS NOT NULL;

CREATE OR REPLACE FUNCTION logistics_couriers_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS logistics_couriers_set_updated_at_trigger ON logistics_couriers;
CREATE TRIGGER logistics_couriers_set_updated_at_trigger
BEFORE UPDATE ON logistics_couriers
FOR EACH ROW EXECUTE FUNCTION logistics_couriers_set_updated_at();
