ALTER TABLE inventory_stock ADD COLUMN revision BIGINT NOT NULL DEFAULT 1
  CHECK (revision BETWEEN 1 AND 9007199254740991);

CREATE OR REPLACE FUNCTION inventory_increment_stock_revision()
RETURNS TRIGGER AS $$
BEGIN
  NEW.revision = OLD.revision + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_stock_increment_revision
BEFORE UPDATE ON inventory_stock
FOR EACH ROW EXECUTE FUNCTION inventory_increment_stock_revision();
