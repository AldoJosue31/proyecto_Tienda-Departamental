CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE catalog_status AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS catalog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_categories_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT catalog_categories_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT catalog_categories_slug_key UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS catalog_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_brands_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT catalog_brands_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT catalog_brands_slug_key UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES catalog_categories(id) ON DELETE RESTRICT,
  brand_id UUID NOT NULL REFERENCES catalog_brands(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL,
  description TEXT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  image_url VARCHAR(2048) NULL,
  status catalog_status NOT NULL DEFAULT 'ACTIVE',
  catalog_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_products_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT catalog_products_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT catalog_products_catalog_version_positive CHECK (catalog_version >= 1),
  CONSTRAINT catalog_products_slug_key UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS catalog_product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE RESTRICT,
  sku VARCHAR(64) NOT NULL,
  size VARCHAR(120) NULL,
  color VARCHAR(120) NULL,
  material VARCHAR(120) NULL,
  list_price NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
  status catalog_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_product_variants_sku_format CHECK (sku ~ '^[A-Z0-9][A-Z0-9._-]*$'),
  CONSTRAINT catalog_product_variants_list_price_nonnegative CHECK (list_price >= 0),
  CONSTRAINT catalog_product_variants_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT catalog_product_variants_sku_key UNIQUE (sku)
);

CREATE TABLE IF NOT EXISTS catalog_metadata (
  key TEXT PRIMARY KEY,
  value BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_metadata_value_positive CHECK (value >= 1)
);

INSERT INTO catalog_metadata (key, value)
VALUES ('catalog_version', 1)
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS catalog_products_public_list_idx
  ON catalog_products (status, name ASC, id ASC);

CREATE INDEX IF NOT EXISTS catalog_products_category_idx
  ON catalog_products (category_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS catalog_products_brand_idx
  ON catalog_products (brand_id)
  WHERE status = 'ACTIVE';

CREATE OR REPLACE FUNCTION catalog_tags_as_text(tags TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT array_to_string(tags, ' ')
$$;

CREATE INDEX IF NOT EXISTS catalog_products_search_idx
  ON catalog_products
  USING GIN (to_tsvector('spanish'::regconfig, coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || catalog_tags_as_text(tags)));

CREATE INDEX IF NOT EXISTS catalog_product_variants_product_idx
  ON catalog_product_variants (product_id, status, sku ASC);

CREATE OR REPLACE FUNCTION catalog_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_categories_set_updated_at ON catalog_categories;
CREATE TRIGGER catalog_categories_set_updated_at
BEFORE UPDATE ON catalog_categories
FOR EACH ROW
EXECUTE FUNCTION catalog_set_updated_at();

DROP TRIGGER IF EXISTS catalog_brands_set_updated_at ON catalog_brands;
CREATE TRIGGER catalog_brands_set_updated_at
BEFORE UPDATE ON catalog_brands
FOR EACH ROW
EXECUTE FUNCTION catalog_set_updated_at();

DROP TRIGGER IF EXISTS catalog_products_set_updated_at ON catalog_products;
CREATE TRIGGER catalog_products_set_updated_at
BEFORE UPDATE ON catalog_products
FOR EACH ROW
EXECUTE FUNCTION catalog_set_updated_at();

DROP TRIGGER IF EXISTS catalog_product_variants_set_updated_at ON catalog_product_variants;
CREATE TRIGGER catalog_product_variants_set_updated_at
BEFORE UPDATE ON catalog_product_variants
FOR EACH ROW
EXECUTE FUNCTION catalog_set_updated_at();
