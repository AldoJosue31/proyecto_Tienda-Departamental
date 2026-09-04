import { Pool, type PoolClient } from "pg";

import "../config/load-env";
import { loadDatabaseConfig } from "../config/environment";

interface SeedVariant {
  id: string;
  sku: string;
  size?: string;
  color?: string;
  material?: string;
  listPrice: number;
}

interface SeedProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: { name: string; slug: string };
  brand: { name: string; slug: string };
  tags: string[];
  imageUrl: string;
  variant: SeedVariant;
}

const IMAGE_URL = "/catalog/departmental-products-v1.png";

const products: SeedProduct[] = [
  {
    id: "a1000000-0000-4000-8000-000000000001",
    slug: "smart-tv-aurora-55",
    name: "Smart TV Aurora 55\" 4K",
    description: "Panel 4K con HDR y sistema de entretenimiento integrado.",
    category: { name: "Electrónica", slug: "electronica" },
    brand: { name: "Aurora", slug: "aurora" },
    tags: ["4K", "HDR", "55 pulgadas"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000001",
      sku: "AUR-55-4K",
      size: "55 pulgadas",
      listPrice: 12_999,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000002",
    slug: "audifonos-nova-anc",
    name: "Audífonos Nova ANC",
    description: "Cancelación adaptativa de ruido y 32 horas de batería.",
    category: { name: "Electrónica", slug: "electronica" },
    brand: { name: "Nova", slug: "nova" },
    tags: ["Bluetooth", "ANC", "Audio"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000002",
      sku: "NOV-ANC-01",
      color: "Grafito",
      listPrice: 2_899,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000003",
    slug: "lampara-lumen-mesa",
    name: "Lámpara Lumen de mesa",
    description: "Iluminación cálida regulable para sala o escritorio.",
    category: { name: "Hogar", slug: "hogar" },
    brand: { name: "Lumen", slug: "lumen" },
    tags: ["LED", "Regulable", "Hogar"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000003",
      sku: "LUM-DESK-01",
      color: "Arena",
      listPrice: 1_499,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000004",
    slug: "tenis-kinetic-run",
    name: "Tenis Kinetic Run",
    description: "Amortiguación reactiva para entrenamiento diario.",
    category: { name: "Deportes", slug: "deportes" },
    brand: { name: "Kinetic", slug: "kinetic" },
    tags: ["Running", "Ligero", "Unisex"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000004",
      sku: "KIN-RUN-26",
      size: "26",
      color: "Gris",
      material: "Textil",
      listPrice: 2_199,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000005",
    slug: "silla-atelier",
    name: "Silla Atelier",
    description: "Silla de acento con estructura de madera certificada.",
    category: { name: "Hogar", slug: "hogar" },
    brand: { name: "Atelier", slug: "atelier" },
    tags: ["Madera", "Diseño", "Sala"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000005",
      sku: "ATL-CHR-01",
      color: "Terracota",
      material: "Madera",
      listPrice: 4_699,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000006",
    slug: "reloj-vertex-fit",
    name: "Reloj Vertex Fit",
    description: "Métricas de actividad, sueño y recuperación.",
    category: { name: "Deportes", slug: "deportes" },
    brand: { name: "Vertex", slug: "vertex" },
    tags: ["GPS", "Salud", "Resistente"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000006",
      sku: "VTX-FIT-02",
      color: "Negro",
      material: "Aluminio",
      listPrice: 3_499,
    },
  },
];

async function referencedId(
  client: PoolClient,
  table: "catalog_categories" | "catalog_brands",
  name: string,
  slug: string,
): Promise<string> {
  await client.query(
    `INSERT INTO ${table} (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
    [name, slug],
  );
  const result = await client.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("Catalog seed reference was not found.");
  }
  return id;
}

async function seedProduct(client: PoolClient, product: SeedProduct): Promise<boolean> {
  const categoryId = await referencedId(
    client,
    "catalog_categories",
    product.category.name,
    product.category.slug,
  );
  const brandId = await referencedId(
    client,
    "catalog_brands",
    product.brand.name,
    product.brand.slug,
  );
  const productResult = await client.query(
    `
      INSERT INTO catalog_products (
        id, category_id, brand_id, name, slug, description, tags, image_url, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
      ON CONFLICT (slug) DO NOTHING
    `,
    [
      product.id,
      categoryId,
      brandId,
      product.name,
      product.slug,
      product.description,
      product.tags,
      product.imageUrl,
    ],
  );
  const linkedProduct = await client.query<{ id: string }>(
    "SELECT id FROM catalog_products WHERE slug = $1 LIMIT 1",
    [product.slug],
  );
  const productId = linkedProduct.rows[0]?.id;
  if (!productId) {
    throw new Error("Catalog seed product was not found.");
  }
  const variantResult = await client.query(
    `
      INSERT INTO catalog_product_variants (
        id, product_id, sku, size, color, material, list_price, currency, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'MXN', 'ACTIVE')
      ON CONFLICT (sku) DO NOTHING
    `,
    [
      product.variant.id,
      productId,
      product.variant.sku,
      product.variant.size ?? null,
      product.variant.color ?? null,
      product.variant.material ?? null,
      product.variant.listPrice,
    ],
  );
  return (productResult.rowCount ?? 0) > 0 || (variantResult.rowCount ?? 0) > 0;
}

async function run(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Catalog seed is disabled in production.");
  }

  const config = loadDatabaseConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    let changed = false;
    for (const product of products) {
      changed = (await seedProduct(client, product)) || changed;
    }
    if (changed) {
      await client.query(
        `
          UPDATE catalog_metadata
          SET value = value + 1, updated_at = NOW()
          WHERE key = 'catalog_version'
        `,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run()
  .then(() => process.stdout.write("Local catalog seed completed.\n"))
  .catch(() => {
    // Do not emit SQL or connection details from a failing seed command.
    process.stderr.write("Catalog seed failed.\n");
    process.exitCode = 1;
  });
