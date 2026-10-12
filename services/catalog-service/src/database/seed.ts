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
  variant?: SeedVariant;
  variants?: SeedVariant[];
}

interface SeedOption {
  name: string;
  code: string;
}

function variantMatrix(
  productNumber: number,
  skuPrefix: string,
  colors: readonly SeedOption[],
  materials: readonly SeedOption[],
  basePrice: number,
  sizePriceStep: number,
  materialPriceStep: number,
): SeedVariant[] {
  let sequence = 0;
  return ["S", "M", "L"].flatMap((size, sizeIndex) =>
    colors.flatMap((color) =>
      materials.map((material, materialIndex) => {
        sequence += 1;
        return {
          id: `a2000000-0000-4000-8000-${String(productNumber * 100 + sequence).padStart(12, "0")}`,
          sku: `${skuPrefix}-${size}-${color.code}-${material.code}`,
          size,
          color: color.name,
          material: material.name,
          listPrice: basePrice + sizeIndex * sizePriceStep + materialIndex * materialPriceStep,
        };
      }),
    ),
  );
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
  {
    id: "a1000000-0000-4000-8000-000000000007",
    slug: "cafetera-bruma-espresso",
    name: "Cafetera Bruma Espresso",
    description: "Cafetera compacta con portafiltro y vaporizador para preparar espresso en casa.",
    category: { name: "Cocina", slug: "cocina" },
    brand: { name: "Bruma", slug: "bruma" },
    tags: ["Café", "Espresso", "Compacta"],
    imageUrl: "/catalog/cafetera-bruma-espresso.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000007",
      sku: "BRU-ESP-01",
      color: "Marfil",
      material: "Acero",
      listPrice: 3_499,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000008",
    slug: "licuadora-nara-personal",
    name: "Licuadora Nara Personal",
    description: "Licuadora de tamaño personal con vaso transparente y controles sencillos.",
    category: { name: "Cocina", slug: "cocina" },
    brand: { name: "Nara", slug: "nara" },
    tags: ["Licuadora", "Personal", "Cocina"],
    imageUrl: "/catalog/licuadora-nara-personal.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000008",
      sku: "NAR-BLD-01",
      color: "Verde salvia",
      listPrice: 1_299,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000009",
    slug: "mochila-vento-urbana",
    name: "Mochila Vento Urbana",
    description: "Mochila de uso diario con compartimento principal y bolsillo frontal.",
    category: { name: "Viajes", slug: "viajes" },
    brand: { name: "Vento", slug: "vento" },
    tags: ["Mochila", "Urbana", "Viaje"],
    imageUrl: "/catalog/mochila-vento-urbana.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000009",
      sku: "VEN-BAG-01",
      color: "Grafito",
      material: "Textil",
      listPrice: 1_599,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000010",
    slug: "maleta-nomad-cabina",
    name: "Maleta Nomad de cabina",
    description: "Maleta rígida de cabina con cuatro ruedas y asa telescópica.",
    category: { name: "Viajes", slug: "viajes" },
    brand: { name: "Nomad", slug: "nomad" },
    tags: ["Maleta", "Cabina", "Viaje"],
    imageUrl: "/catalog/maleta-nomad-cabina.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000010",
      sku: "NOM-CAB-01",
      size: "Cabina",
      color: "Terracota",
      material: "Policarbonato",
      listPrice: 3_299,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000011",
    slug: "serum-clara-hidratante",
    name: "Sérum Clara hidratante",
    description: "Sérum facial de uso diario en frasco de vidrio con gotero.",
    category: { name: "Belleza", slug: "belleza" },
    brand: { name: "Clara", slug: "clara" },
    tags: ["Cuidado facial", "Sérum", "Hidratación"],
    imageUrl: "/catalog/serum-clara-hidratante.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000011",
      sku: "CLA-SER-30",
      size: "30 ml",
      material: "Vidrio",
      listPrice: 549,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000012",
    slug: "escritorio-luma-compacto",
    name: "Escritorio Luma compacto",
    description: "Escritorio de madera clara con cajón, ideal para espacios de trabajo pequeños.",
    category: { name: "Oficina", slug: "oficina" },
    brand: { name: "Luma", slug: "luma" },
    tags: ["Escritorio", "Madera", "Home office"],
    imageUrl: "/catalog/escritorio-luma-compacto.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000012",
      sku: "LUM-DESK-120",
      size: "120 cm",
      color: "Roble claro",
      material: "Madera",
      listPrice: 4_999,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000013",
    slug: "camara-prisma-instantanea",
    name: "Cámara Prisma instantánea",
    description: "Cámara compacta de fotografía instantánea con flash integrado.",
    category: { name: "Electrónica", slug: "electronica" },
    brand: { name: "Prisma", slug: "prisma" },
    tags: ["Fotografía", "Instantánea", "Cámara"],
    imageUrl: "/catalog/camara-prisma-instantanea.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000013",
      sku: "PRI-CAM-01",
      color: "Azul cielo",
      listPrice: 2_499,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000014",
    slug: "bloques-tilo-madera",
    name: "Bloques Tilo de madera",
    description: "Juego de bloques de madera con formas y colores suaves para construir.",
    category: { name: "Juguetes", slug: "juguetes" },
    brand: { name: "Tilo", slug: "tilo" },
    tags: ["Construcción", "Madera", "Creatividad"],
    imageUrl: "/catalog/bloques-tilo-madera.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000014",
      sku: "TIL-BLK-01",
      color: "Multicolor",
      material: "Madera",
      listPrice: 899,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000015",
    slug: "camisa-aural-relajada",
    name: "Camisa Aural relajada",
    description: "Camisa de manga larga y corte relajado para combinar a diario.",
    category: { name: "Moda", slug: "moda" },
    brand: { name: "Aural", slug: "aural" },
    tags: ["Camisa", "Unisex", "Tallas S M L"],
    imageUrl: "/catalog/camisa-aural-relajada.png",
    variants: variantMatrix(15, "AUR-CAM", [
      { name: "Marfil", code: "MAR" },
      { name: "Azul petróleo", code: "AZP" },
    ], [
      { name: "Algodón", code: "ALG" },
      { name: "Lino", code: "LIN" },
    ], 899, 40, 180),
  },
  {
    id: "a1000000-0000-4000-8000-000000000016",
    slug: "sudadera-boreal-capucha",
    name: "Sudadera Boreal con capucha",
    description: "Sudadera unisex de corte cómodo con capucha y bolsillo frontal.",
    category: { name: "Moda", slug: "moda" },
    brand: { name: "Boreal", slug: "boreal" },
    tags: ["Sudadera", "Unisex", "Tallas S M L"],
    imageUrl: "/catalog/sudadera-boreal-capucha.png",
    variants: variantMatrix(16, "BOR-SUD", [
      { name: "Verde pino", code: "PIN" },
      { name: "Arena", code: "ARE" },
    ], [
      { name: "Algodón", code: "ALG" },
      { name: "Felpa reciclada", code: "FEL" },
    ], 1_199, 60, 200),
  },
  {
    id: "a1000000-0000-4000-8000-000000000017",
    slug: "pantalon-terral-cargo",
    name: "Pantalón Terral cargo",
    description: "Pantalón unisex de corte relajado con bolsillos laterales.",
    category: { name: "Moda", slug: "moda" },
    brand: { name: "Terral", slug: "terral" },
    tags: ["Pantalón", "Cargo", "Tallas S M L"],
    imageUrl: "/catalog/pantalon-terral-cargo.png",
    variants: variantMatrix(17, "TER-PAN", [
      { name: "Caqui", code: "CAQ" },
      { name: "Grafito", code: "GRA" },
    ], [
      { name: "Algodón", code: "ALG" },
      { name: "Sarga reciclada", code: "SAR" },
    ], 1_099, 50, 170),
  },
  {
    id: "a1000000-0000-4000-8000-000000000018",
    slug: "chamarra-brisa-cortaviento",
    name: "Chamarra Brisa cortaviento",
    description: "Chamarra ligera con cierre, capucha y tejido de secado rápido.",
    category: { name: "Deportes", slug: "deportes" },
    brand: { name: "Brisa", slug: "brisa" },
    tags: ["Chamarra", "Exterior", "Tallas S M L"],
    imageUrl: "/catalog/chamarra-brisa-cortaviento.png",
    variants: variantMatrix(18, "BRI-CHA", [
      { name: "Azul petróleo", code: "AZP" },
      { name: "Negro", code: "NEG" },
    ], [
      { name: "Nylon", code: "NYL" },
      { name: "Poliéster reciclado", code: "POL" },
    ], 1_799, 80, 250),
  },
  {
    id: "a1000000-0000-4000-8000-000000000019",
    slug: "mandil-oliva-cocina",
    name: "Mandil Oliva de cocina",
    description: "Mandil ajustable con bolsillos frontales para cocinar con comodidad.",
    category: { name: "Cocina", slug: "cocina" },
    brand: { name: "Oliva", slug: "oliva" },
    tags: ["Mandil", "Cocina", "Tallas S M L"],
    imageUrl: "/catalog/mandil-oliva-cocina.png",
    variants: variantMatrix(19, "OLI-MAN", [
      { name: "Terracota", code: "TER" },
      { name: "Azul marino", code: "AZM" },
    ], [
      { name: "Lona de algodón", code: "LON" },
      { name: "Lino", code: "LIN" },
    ], 549, 30, 120),
  },
  {
    id: "a1000000-0000-4000-8000-000000000020",
    slug: "cama-nido-mascotas",
    name: "Cama Nido para mascotas",
    description: "Cama acolchada con bordes suaves y cojín central removible.",
    category: { name: "Mascotas", slug: "mascotas" },
    brand: { name: "Nido", slug: "nido" },
    tags: ["Mascotas", "Cama", "Tallas S M L"],
    imageUrl: "/catalog/cama-nido-mascotas.png",
    variants: variantMatrix(20, "NID-CAM", [
      { name: "Arena", code: "ARE" },
      { name: "Terracota", code: "TER" },
    ], [
      { name: "Lona", code: "LON" },
      { name: "Terciopelo", code: "VEL" },
    ], 899, 250, 180),
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
  const variants = product.variants ?? (product.variant ? [product.variant] : []);
  if (variants.length === 0) {
    throw new Error("Catalog seed product has no variants.");
  }
  let changed = (productResult.rowCount ?? 0) > 0;
  for (const variant of variants) {
    const variantResult = await client.query(
      `
        INSERT INTO catalog_product_variants (
          id, product_id, sku, size, color, material, list_price, currency, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'MXN', 'ACTIVE')
        ON CONFLICT (sku) DO NOTHING
      `,
      [
        variant.id,
        productId,
        variant.sku,
        variant.size ?? null,
        variant.color ?? null,
        variant.material ?? null,
        variant.listPrice,
      ],
    );
    changed = (variantResult.rowCount ?? 0) > 0 || changed;
  }
  return changed;
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
