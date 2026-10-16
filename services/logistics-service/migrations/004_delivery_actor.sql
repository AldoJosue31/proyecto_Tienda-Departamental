ALTER TABLE logistics_couriers ADD COLUMN last_location_source TEXT NULL CHECK (last_location_source IN ('DEVICE','DEMO','MANUAL'));
ALTER TABLE logistics_shipments ADD COLUMN delivered_at TIMESTAMPTZ NULL;
CREATE INDEX logistics_courier_assigned_idx ON logistics_shipments(courier_id,status,updated_at);
