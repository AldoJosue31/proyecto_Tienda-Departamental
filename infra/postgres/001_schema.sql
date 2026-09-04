CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE reservation_status AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');
CREATE TYPE checkout_status AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'OUT_OF_STOCK', 'PAYMENT_FAILED');

CREATE TABLE branches (
  id text PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id text PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  product_name text NOT NULL,
  variant_label text NOT NULL,
  category text NOT NULL,
  list_price numeric(12, 2) NOT NULL CHECK (list_price >= 0),
  currency char(3) NOT NULL DEFAULT 'MXN',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id text NOT NULL REFERENCES product_variants(id),
  branch_id text NOT NULL REFERENCES branches(id),
  on_hand integer NOT NULL CHECK (on_hand >= 0),
  reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0 AND reserved_quantity <= on_hand),
  low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, branch_id)
);

CREATE TABLE checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status checkout_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES checkouts(id),
  inventory_id uuid NOT NULL REFERENCES inventory(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  status reservation_status NOT NULL DEFAULT 'ACTIVE',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES inventory(id),
  checkout_id uuid REFERENCES checkouts(id),
  movement_type text NOT NULL CHECK (movement_type IN ('SALE', 'ADJUSTMENT', 'RELEASE')),
  quantity_delta integer NOT NULL,
  reason text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE price_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'DISABLED')),
  priority integer NOT NULL DEFAULT 0,
  discount_type text NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
  discount_value numeric(12, 2) NOT NULL CHECK (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  business_timezone text NOT NULL DEFAULT 'America/Mexico_City',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX inventory_reservations_expiry_idx ON inventory_reservations (status, expires_at);
CREATE INDEX outbox_events_pending_idx ON outbox_events (published_at, occurred_at) WHERE published_at IS NULL;

INSERT INTO branches (id, name, city) VALUES
  ('centro', 'Centro', 'Ciudad de México'),
  ('norte', 'Norte', 'Naucalpan'),
  ('sur', 'Sur', 'Coyoacán')
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_variants (id, sku, product_name, variant_label, category, list_price) VALUES
  ('variant-aurora-55', 'AUR-55-4K', 'Smart TV Aurora 55" 4K', '55 pulgadas', 'Electrónica', 12999),
  ('variant-nova-anc', 'NOV-ANC-01', 'Audífonos Nova ANC', 'Grafito', 'Electrónica', 2899),
  ('variant-lumen-lamp', 'LUM-DESK-01', 'Lámpara Lumen de mesa', 'Arena', 'Hogar', 1499),
  ('variant-kinetic-26', 'KIN-RUN-26', 'Tenis Kinetic Run', 'Talla 26', 'Deportes', 2199),
  ('variant-atelier-chair', 'ATL-CHR-01', 'Silla Atelier', 'Terracota', 'Hogar', 4699),
  ('variant-vertex-fit', 'VTX-FIT-02', 'Reloj Vertex Fit', 'Negro', 'Deportes', 3499)
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory (variant_id, branch_id, on_hand, reserved_quantity, low_stock_threshold) VALUES
  ('variant-aurora-55', 'centro', 1, 0, 3), ('variant-aurora-55', 'norte', 8, 0, 3), ('variant-aurora-55', 'sur', 4, 0, 3),
  ('variant-nova-anc', 'centro', 18, 2, 5), ('variant-nova-anc', 'norte', 11, 1, 5), ('variant-nova-anc', 'sur', 7, 0, 5),
  ('variant-lumen-lamp', 'centro', 6, 0, 4), ('variant-lumen-lamp', 'norte', 3, 0, 4), ('variant-lumen-lamp', 'sur', 9, 0, 4),
  ('variant-kinetic-26', 'centro', 14, 1, 5), ('variant-kinetic-26', 'norte', 12, 0, 5), ('variant-kinetic-26', 'sur', 2, 0, 5),
  ('variant-atelier-chair', 'centro', 2, 0, 2), ('variant-atelier-chair', 'norte', 5, 1, 2), ('variant-atelier-chair', 'sur', 3, 0, 2),
  ('variant-vertex-fit', 'centro', 10, 0, 5), ('variant-vertex-fit', 'norte', 4, 0, 5), ('variant-vertex-fit', 'sur', 6, 1, 5)
ON CONFLICT (variant_id, branch_id) DO NOTHING;

-- This function is the production concurrency boundary. Every inventory row is
-- locked in a stable order, every line is validated, and all mutations commit
-- together. It must be invoked inside the checkout transaction.
CREATE OR REPLACE FUNCTION reserve_inventory_atomic(p_checkout_id uuid, p_lines jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  insufficient boolean;
BEGIN
  WITH requested AS (
    SELECT variant_id, branch_id, sum(quantity)::integer AS quantity
    FROM jsonb_to_recordset(p_lines) AS line(variant_id text, branch_id text, quantity integer)
    GROUP BY variant_id, branch_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM requested r
    LEFT JOIN inventory i ON i.variant_id = r.variant_id AND i.branch_id = r.branch_id
    WHERE i.id IS NULL OR i.on_hand - i.reserved_quantity < r.quantity
  ) INTO insufficient;

  IF insufficient THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OUT_OF_STOCK';
  END IF;

  -- Lock after the initial validation and repeat validation under the locks.
  PERFORM i.id
  FROM inventory i
  JOIN (
    SELECT variant_id, branch_id, sum(quantity)::integer AS quantity
    FROM jsonb_to_recordset(p_lines) AS line(variant_id text, branch_id text, quantity integer)
    GROUP BY variant_id, branch_id
  ) r ON r.variant_id = i.variant_id AND r.branch_id = i.branch_id
  ORDER BY i.variant_id, i.branch_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM inventory i
    JOIN (
      SELECT variant_id, branch_id, sum(quantity)::integer AS quantity
      FROM jsonb_to_recordset(p_lines) AS line(variant_id text, branch_id text, quantity integer)
      GROUP BY variant_id, branch_id
    ) r ON r.variant_id = i.variant_id AND r.branch_id = i.branch_id
    WHERE i.on_hand - i.reserved_quantity < r.quantity
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OUT_OF_STOCK';
  END IF;

  WITH requested AS (
    SELECT variant_id, branch_id, sum(quantity)::integer AS quantity
    FROM jsonb_to_recordset(p_lines) AS line(variant_id text, branch_id text, quantity integer)
    GROUP BY variant_id, branch_id
  )
  UPDATE inventory i
  SET reserved_quantity = i.reserved_quantity + r.quantity, updated_at = now()
  FROM requested r
  WHERE i.variant_id = r.variant_id AND i.branch_id = r.branch_id;

  INSERT INTO inventory_reservations (checkout_id, inventory_id, quantity, expires_at)
  SELECT p_checkout_id, i.id, r.quantity, now() + interval '10 minutes'
  FROM inventory i
  JOIN (
    SELECT variant_id, branch_id, sum(quantity)::integer AS quantity
    FROM jsonb_to_recordset(p_lines) AS line(variant_id text, branch_id text, quantity integer)
    GROUP BY variant_id, branch_id
  ) r ON r.variant_id = i.variant_id AND r.branch_id = i.branch_id;
END;
$$;
