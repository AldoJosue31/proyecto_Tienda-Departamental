import type {
  BranchId,
  CheckoutInput,
  CheckoutLineInput,
  CheckoutResult,
  InventoryDashboard,
  InventoryRecord,
} from "@/lib/domain/types";
import { branches, inventorySeed, products } from "@/lib/server/seed-data";
import { postgresPersistenceEnabled } from "@/lib/server/postgres";
import { getPostgresAvailableQuantity, getPostgresInventoryDashboard } from "@/lib/server/postgres-inventory";

type Reservation = {
  id: string;
  checkoutId: string;
  variantId: string;
  branchId: BranchId;
  quantity: number;
  status: "ACTIVE" | "CONSUMED" | "RELEASED" | "EXPIRED";
  expiresAt: number;
};

type StoredCheckout = {
  id: string;
  input: CheckoutInput;
  result?: CheckoutResult;
};

type InventoryRuntime = {
  inventory: Map<string, InventoryRecord>;
  reservations: Map<string, Reservation>;
  checkoutsByIdempotencyKey: Map<string, StoredCheckout>;
  sequence: number;
};

declare global {
  var departmentStore: InventoryRuntime | undefined;
}

function inventoryKey(variantId: string, branchId: BranchId) {
  return `${variantId}:${branchId}`;
}

function createRuntime(): InventoryRuntime {
  return {
    inventory: new Map(
      inventorySeed.map((record) => [inventoryKey(record.variantId, record.branchId), { ...record }]),
    ),
    reservations: new Map(),
    checkoutsByIdempotencyKey: new Map(),
    sequence: 0,
  };
}

function runtime() {
  if (!globalThis.departmentStore) globalThis.departmentStore = createRuntime();
  return globalThis.departmentStore;
}

function aggregateLines(lines: CheckoutLineInput[]) {
  const grouped = new Map<string, CheckoutLineInput>();
  for (const line of lines) {
    const key = inventoryKey(line.variantId, line.branchId);
    const current = grouped.get(key);
    grouped.set(key, {
      ...line,
      quantity: (current?.quantity ?? 0) + line.quantity,
    });
  }
  return [...grouped.values()].sort((a, b) => inventoryKey(a.variantId, a.branchId).localeCompare(inventoryKey(b.variantId, b.branchId)));
}

function availableQuantityInMemory(variantId: string, branchId: BranchId) {
  const record = runtime().inventory.get(inventoryKey(variantId, branchId));
  return record ? record.onHand - record.reservedQuantity : 0;
}

export async function availableQuantity(variantId: string, branchId: BranchId) {
  return postgresPersistenceEnabled()
    ? getPostgresAvailableQuantity(variantId, branchId)
    : availableQuantityInMemory(variantId, branchId);
}

/**
 * Development implementation of the same reserve/consume state machine used by
 * the PostgreSQL adapter. It remains synchronous inside the process so a batch
 * is all-or-nothing; production must use SELECT ... FOR UPDATE as documented.
 */
export function reserveCheckout(input: CheckoutInput) {
  const state = runtime();
  const existing = state.checkoutsByIdempotencyKey.get(input.idempotencyKey);
  if (existing) return existing;

  const lines = aggregateLines(input.lines);
  const unavailableLines = lines.filter((line) => availableQuantityInMemory(line.variantId, line.branchId) < line.quantity);
  const checkoutId = `chk_${++state.sequence}`;
  const checkout: StoredCheckout = { id: checkoutId, input };

  if (unavailableLines.length > 0) {
    checkout.result = {
      checkoutId,
      status: "OUT_OF_STOCK",
      message: "Una o más líneas ya no tienen existencias suficientes.",
      unavailableLines,
    };
    state.checkoutsByIdempotencyKey.set(input.idempotencyKey, checkout);
    return checkout;
  }

  for (const line of lines) {
    const record = state.inventory.get(inventoryKey(line.variantId, line.branchId));
    if (!record) throw new Error("El inventario solicitado no existe.");
    record.reservedQuantity += line.quantity;
    const reservation: Reservation = {
      id: `res_${++state.sequence}`,
      checkoutId,
      variantId: line.variantId,
      branchId: line.branchId,
      quantity: line.quantity,
      status: "ACTIVE",
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    state.reservations.set(reservation.id, reservation);
  }

  state.checkoutsByIdempotencyKey.set(input.idempotencyKey, checkout);
  return checkout;
}

export function confirmReservedCheckout(checkout: StoredCheckout): CheckoutResult {
  if (checkout.result) return checkout.result;
  const state = runtime();
  const reservations = [...state.reservations.values()].filter(
    (reservation) => reservation.checkoutId === checkout.id && reservation.status === "ACTIVE",
  );

  for (const reservation of reservations) {
    const record = state.inventory.get(inventoryKey(reservation.variantId, reservation.branchId));
    if (!record) throw new Error("El inventario reservado no existe.");
    record.onHand -= reservation.quantity;
    record.reservedQuantity -= reservation.quantity;
    reservation.status = "CONSUMED";
  }

  checkout.result = {
    checkoutId: checkout.id,
    status: "CONFIRMED",
    orderNumber: `TD-${String(state.sequence).padStart(6, "0")}`,
    message: "Pago autorizado y pedido confirmado.",
  };
  return checkout.result;
}

export function releaseExpiredReservations(now = Date.now()) {
  const state = runtime();
  let released = 0;
  for (const reservation of state.reservations.values()) {
    if (reservation.status !== "ACTIVE" || reservation.expiresAt > now) continue;
    const record = state.inventory.get(inventoryKey(reservation.variantId, reservation.branchId));
    if (!record) continue;
    record.reservedQuantity -= reservation.quantity;
    reservation.status = "EXPIRED";
    released += 1;
  }
  return released;
}

function getInMemoryInventoryDashboard(branchId: BranchId): InventoryDashboard {
  const branch = branches.find((item) => item.id === branchId) ?? branches[0];
  const categoryTotals = new Map<string, { available: number; reserved: number }>();
  const lowStock: InventoryDashboard["lowStock"] = [];

  for (const product of products) {
    const record = runtime().inventory.get(inventoryKey(product.variant.id, branch.id));
    if (!record) continue;
    const available = record.onHand - record.reservedQuantity;
    const total = categoryTotals.get(product.category) ?? { available: 0, reserved: 0 };
    total.available += available;
    total.reserved += record.reservedQuantity;
    categoryTotals.set(product.category, total);
    if (available <= record.lowStockThreshold) {
      lowStock.push({
        productName: product.name,
        variantLabel: product.variant.label,
        available,
        threshold: record.lowStockThreshold,
      });
    }
  }

  const categories = [...categoryTotals.entries()]
    .map(([category, totals]) => ({ category, ...totals }))
    .sort((a, b) => b.available - a.available);
  const totalAvailable = categories.reduce((sum, category) => sum + category.available, 0);
  const totalReserved = categories.reduce((sum, category) => sum + category.reserved, 0);

  return {
    branch,
    generatedAt: new Date().toISOString(),
    categories,
    stockDistribution: [
      { label: "Disponible", value: totalAvailable },
      { label: "Reservado", value: totalReserved },
    ],
    lowStock: lowStock.sort((a, b) => a.available - b.available),
  };
}

export async function getInventoryDashboard(branchId: BranchId) {
  return postgresPersistenceEnabled()
    ? getPostgresInventoryDashboard(branchId)
    : getInMemoryInventoryDashboard(branchId);
}

export function resetDevelopmentInventory() {
  globalThis.departmentStore = createRuntime();
}
