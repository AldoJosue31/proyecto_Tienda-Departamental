import type {
  InventoryDashboard,
  InventoryDashboardItem,
  StockUpdatedEvent,
} from "@/lib/inventory/dashboard-types";

const MAX_LATENCY_SAMPLES = 50;

export type RealtimeLatency = {
  lastMilliseconds: number;
  p95Milliseconds: number;
  sampleSize: number;
};

export type RealtimeLatencyMeasurement = {
  samples: number[];
  latency: RealtimeLatency | null;
};

function isLowStock(item: InventoryDashboardItem) {
  return item.reorderPoint !== null && item.available <= item.reorderPoint;
}

function lowStockItems(items: InventoryDashboardItem[]) {
  return items
    .filter(isLowStock)
    .sort((left, right) => left.available - right.available || left.product.productName.localeCompare(right.product.productName, "es"));
}

function summary(items: InventoryDashboardItem[]) {
  return {
    onHand: items.reduce((total, item) => total + item.onHand, 0),
    reserved: items.reduce((total, item) => total + item.reserved, 0),
    available: items.reduce((total, item) => total + item.available, 0),
    lowStock: items.filter(isLowStock).length,
    outOfStock: items.filter((item) => item.available === 0).length,
  };
}

/**
 * Applies the canonical Inventory event only when it belongs to the visible
 * branch and is newer than the snapshot already displayed. Product identity
 * stays owned by Inventory, so an unknown variant must be loaded by the caller.
 */
export function mergeStockUpdated(
  dashboard: InventoryDashboard,
  event: StockUpdatedEvent,
  generatedAt = new Date().toISOString(),
) {
  if (event.branchId !== dashboard.branch.id) {
    return { dashboard, applied: false };
  }

  const current = dashboard.items.find((item) => item.variantId === event.variantId);
  if (!current || Date.parse(event.lastUpdatedAt) < Date.parse(current.lastUpdatedAt)) {
    return { dashboard, applied: false };
  }

  const updated: InventoryDashboardItem = {
    ...current,
    onHand: event.onHand,
    reserved: event.reserved,
    available: event.available,
    reorderPoint: event.reorderPoint,
    lastUpdatedAt: event.lastUpdatedAt,
  };
  const items = dashboard.items.map((item) => item.variantId === event.variantId ? updated : item);
  const lowStock = lowStockItems(items);

  return {
    applied: true,
    dashboard: {
      ...dashboard,
      generatedAt,
      items,
      lowStock,
      summary: summary(items),
    },
  };
}

export function recordRealtimeLatency(
  samples: number[],
  occurredAt: string,
  receivedAt = Date.now(),
): RealtimeLatencyMeasurement {
  const timestamp = Date.parse(occurredAt);
  if (Number.isNaN(timestamp)) {
    return { samples, latency: null };
  }

  const nextSamples = [...samples, Math.max(0, receivedAt - timestamp)].slice(-MAX_LATENCY_SAMPLES);
  const ordered = [...nextSamples].sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(ordered.length * 0.95) - 1);

  return {
    samples: nextSamples,
    latency: {
      lastMilliseconds: nextSamples.at(-1) ?? 0,
      p95Milliseconds: ordered[p95Index] ?? 0,
      sampleSize: nextSamples.length,
    },
  };
}
