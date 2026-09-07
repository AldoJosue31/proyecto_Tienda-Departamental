import { Pool, type PoolClient } from "pg";

import "../config/load-env";
import { loadDatabaseConfig } from "../config/environment";

interface SeedVariant {
  id: string;
  productName: string;
  sku: string;
  variantLabel: string;
}

interface SeedStock {
  variant: SeedVariant;
  branchId: string;
  onHand: number;
  reorderPoint: number | null;
}

const branchIds = {
  centro: "b1000000-0000-4000-8000-000000000001",
  norte: "b1000000-0000-4000-8000-000000000002",
  sur: "b1000000-0000-4000-8000-000000000003",
} as const;

const branches = [
  { id: branchIds.centro, name: "Sucursal Centro" },
  { id: branchIds.norte, name: "Sucursal Norte" },
  { id: branchIds.sur, name: "Sucursal Sur" },
];

const stocks: SeedStock[] = [
  {
    variant: {
      id: "a2000000-0000-4000-8000-000000000001",
      productName: "Smart TV Aurora 55",
      sku: "AUR-55-4K",
      variantLabel: "55 pulgadas",
    },
    branchId: branchIds.centro,
    onHand: 6,
    reorderPoint: 2,
  },
  {
    variant: {
      id: "a2000000-0000-4000-8000-000000000002",
      productName: "Audífonos Nova ANC",
      sku: "NOV-ANC-01",
      variantLabel: "Grafito",
    },
    branchId: branchIds.centro,
    onHand: 12,
    reorderPoint: 4,
  },
  {
    variant: {
      id: "a2000000-0000-4000-8000-000000000003",
      productName: "Lámpara Lumen de mesa",
      sku: "LUM-DESK-01",
      variantLabel: "Arena",
    },
    branchId: branchIds.norte,
    onHand: 3,
    reorderPoint: 3,
  },
  {
    variant: {
      id: "a2000000-0000-4000-8000-000000000004",
      productName: "Tenis Kinetic Run",
      sku: "KIN-RUN-26",
      variantLabel: "26 · Gris · Textil",
    },
    branchId: branchIds.norte,
    onHand: 8,
    reorderPoint: 2,
  },
  {
    variant: {
      id: "a2000000-0000-4000-8000-000000000005",
      productName: "Silla Atelier",
      sku: "ATL-CHR-01",
      variantLabel: "Terracota · Madera",
    },
    branchId: branchIds.sur,
    onHand: 2,
    reorderPoint: 2,
  },
  {
    variant: {
      id: "a2000000-0000-4000-8000-000000000006",
      productName: "Reloj Vertex Fit",
      sku: "VTX-FIT-02",
      variantLabel: "Negro · Aluminio",
    },
    branchId: branchIds.sur,
    onHand: 9,
    reorderPoint: null,
  },
];

async function seedBranch(client: PoolClient, branch: { id: string; name: string }): Promise<void> {
  await client.query(
    [
      "INSERT INTO inventory_branches (id, name)",
      "VALUES ($1, $2)",
      "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name",
    ].join("\n"),
    [branch.id, branch.name],
  );
}

async function seedStock(client: PoolClient, seed: SeedStock): Promise<void> {
  await client.query(
    [
      "INSERT INTO inventory_variant_snapshots (variant_id, product_name, sku, variant_label)",
      "VALUES ($1, $2, $3, $4)",
      "ON CONFLICT (variant_id) DO UPDATE SET",
      "  product_name = EXCLUDED.product_name,",
      "  sku = EXCLUDED.sku,",
      "  variant_label = EXCLUDED.variant_label",
    ].join("\n"),
    [
      seed.variant.id,
      seed.variant.productName,
      seed.variant.sku,
      seed.variant.variantLabel,
    ],
  );
  await client.query(
    [
      "INSERT INTO inventory_stock (variant_id, branch_id, on_hand, reserved, reorder_point)",
      "VALUES ($1, $2, $3, 0, $4)",
      "ON CONFLICT (variant_id, branch_id) DO NOTHING",
    ].join("\n"),
    [seed.variant.id, seed.branchId, seed.onHand, seed.reorderPoint],
  );
}

async function run(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Inventory seed is disabled in production.");
  }
  const config = loadDatabaseConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const branch of branches) {
      await seedBranch(client, branch);
    }
    for (const stock of stocks) {
      await seedStock(client, stock);
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
  .then(() => process.stdout.write("Local inventory seed completed.\n"))
  .catch(() => {
    process.stderr.write("Inventory seed failed.\n");
    process.exitCode = 1;
  });
