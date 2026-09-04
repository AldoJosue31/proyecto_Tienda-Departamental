import type { PoolClient } from "pg";

import type { BranchId, CheckoutInput, CheckoutResult, InventoryDashboard } from "@/lib/domain/types";
import { branches } from "@/lib/server/seed-data";
import { getPostgresPool } from "@/lib/server/postgres";

function orderNumber(checkoutId: string) {
  return `TD-${checkoutId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function toCheckoutResult(row: { id: string; status: string }): CheckoutResult {
  if (row.status === "CONFIRMED") {
    return { checkoutId: row.id, status: "CONFIRMED", orderNumber: orderNumber(row.id), message: "Pago autorizado y pedido confirmado." };
  }
  return { checkoutId: row.id, status: "OUT_OF_STOCK", message: "Una o más líneas ya no tienen existencias suficientes." };
}

export async function getPostgresAvailableQuantity(variantId: string, branchId: BranchId) {
  const result = await getPostgresPool().query<{ available: number }>(
    "SELECT on_hand - reserved_quantity AS available FROM inventory WHERE variant_id = $1 AND branch_id = $2",
    [variantId, branchId],
  );
  return result.rows[0]?.available ?? 0;
}

export async function getPostgresInventoryDashboard(branchId: BranchId): Promise<InventoryDashboard> {
  const branch = branches.find((item) => item.id === branchId) ?? branches[0];
  const [categories, lowStock] = await Promise.all([
    getPostgresPool().query<{ category: string; available: number; reserved: number }>(
      `SELECT pv.category, sum(i.on_hand - i.reserved_quantity)::integer AS available,
              sum(i.reserved_quantity)::integer AS reserved
       FROM inventory i JOIN product_variants pv ON pv.id = i.variant_id
       WHERE i.branch_id = $1 GROUP BY pv.category ORDER BY available DESC`,
      [branch.id],
    ),
    getPostgresPool().query<{ product_name: string; variant_label: string; available: number; threshold: number }>(
      `SELECT pv.product_name, pv.variant_label, (i.on_hand - i.reserved_quantity)::integer AS available,
              i.low_stock_threshold AS threshold
       FROM inventory i JOIN product_variants pv ON pv.id = i.variant_id
       WHERE i.branch_id = $1 AND i.on_hand - i.reserved_quantity <= i.low_stock_threshold
       ORDER BY available ASC, pv.product_name ASC`,
      [branch.id],
    ),
  ]);
  const totalAvailable = categories.rows.reduce((sum, item) => sum + item.available, 0);
  const totalReserved = categories.rows.reduce((sum, item) => sum + item.reserved, 0);
  return {
    branch,
    generatedAt: new Date().toISOString(),
    categories: categories.rows,
    stockDistribution: [
      { label: "Disponible", value: totalAvailable },
      { label: "Reservado", value: totalReserved },
    ],
    lowStock: lowStock.rows.map((item) => ({
      productName: item.product_name,
      variantLabel: item.variant_label,
      available: item.available,
      threshold: item.threshold,
    })),
  };
}

export async function createPostgresCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.idempotencyKey]);
    const existing = await client.query<{ id: string; status: string }>(
      "SELECT id, status FROM checkouts WHERE idempotency_key = $1 FOR UPDATE",
      [input.idempotencyKey],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      return toCheckoutResult(existing.rows[0]);
    }

    const checkout = await client.query<{ id: string }>(
      "INSERT INTO checkouts (customer_id, idempotency_key) VALUES ($1, $2) RETURNING id",
      [input.customerId, input.idempotencyKey],
    );
    const checkoutId = checkout.rows[0].id;

    try {
      await client.query("SELECT reserve_inventory_atomic($1, $2::jsonb)", [checkoutId, JSON.stringify(input.lines)]);
    } catch (error) {
      if ((error as { code?: string }).code !== "P0001") throw error;
      await client.query("UPDATE checkouts SET status = 'OUT_OF_STOCK' WHERE id = $1", [checkoutId]);
      await client.query("COMMIT");
      return { checkoutId, status: "OUT_OF_STOCK", message: "Una o más líneas ya no tienen existencias suficientes." };
    }

    await consumeReservations(client, checkoutId, input.idempotencyKey);
    await client.query("UPDATE checkouts SET status = 'CONFIRMED' WHERE id = $1", [checkoutId]);
    await client.query(
      "INSERT INTO outbox_events (event_type, aggregate_id, payload) VALUES ('order.confirmed', $1, $2::jsonb)",
      [checkoutId, JSON.stringify({ checkoutId, correlationId: input.idempotencyKey })],
    );
    await client.query("COMMIT");
    return { checkoutId, status: "CONFIRMED", orderNumber: orderNumber(checkoutId), message: "Pago autorizado y pedido confirmado." };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function consumeReservations(client: PoolClient, checkoutId: string, correlationId: string) {
  await client.query(
    `UPDATE inventory i
     SET on_hand = i.on_hand - r.quantity,
         reserved_quantity = i.reserved_quantity - r.quantity,
         updated_at = now()
     FROM inventory_reservations r
     WHERE r.checkout_id = $1 AND r.status = 'ACTIVE' AND r.inventory_id = i.id`,
    [checkoutId],
  );
  await client.query(
    `INSERT INTO inventory_movements (inventory_id, checkout_id, movement_type, quantity_delta, reason, correlation_id)
     SELECT inventory_id, checkout_id, 'SALE', -quantity, 'Pago autorizado', $2
     FROM inventory_reservations WHERE checkout_id = $1 AND status = 'ACTIVE'`,
    [checkoutId, correlationId],
  );
  await client.query("UPDATE inventory_reservations SET status = 'CONSUMED' WHERE checkout_id = $1 AND status = 'ACTIVE'", [checkoutId]);
}
