import { describe, expect, it } from "vitest";

import type { InventoryDashboard, StockUpdatedEvent } from "@/lib/inventory/dashboard-types";
import { mergeStockUpdated, recordRealtimeLatency } from "@/lib/inventory/realtime";

const dashboard: InventoryDashboard = {
  branch: { id: "11111111-1111-4111-8111-111111111111", name: "Centro" },
  branches: [{ id: "11111111-1111-4111-8111-111111111111", name: "Centro" }],
  generatedAt: "2026-09-05T12:00:00.000Z",
  items: [{
    id: "22222222-2222-4222-8222-222222222222",
    variantId: "33333333-3333-4333-8333-333333333333",
    branch: { id: "11111111-1111-4111-8111-111111111111", name: "Centro" },
    product: { productName: "Pantalón", sku: "PAN-AZUL-M", variantLabel: "Azul · M" },
    onHand: 1,
    reserved: 0,
    available: 1,
    reorderPoint: 2,
    lastUpdatedAt: "2026-09-05T12:00:00.000Z",
  }],
  lowStock: [{
    id: "22222222-2222-4222-8222-222222222222",
    variantId: "33333333-3333-4333-8333-333333333333",
    branch: { id: "11111111-1111-4111-8111-111111111111", name: "Centro" },
    product: { productName: "Pantalón", sku: "PAN-AZUL-M", variantLabel: "Azul · M" },
    onHand: 1,
    reserved: 0,
    available: 1,
    reorderPoint: 2,
    lastUpdatedAt: "2026-09-05T12:00:00.000Z",
  }],
  summary: { onHand: 1, reserved: 0, available: 1, lowStock: 1, outOfStock: 0 },
};

const stockUpdated: StockUpdatedEvent = {
  eventId: "44444444-4444-4444-8444-444444444444",
  occurredAt: "2026-09-05T12:00:01.000Z",
  correlationId: null,
  variantId: "33333333-3333-4333-8333-333333333333",
  branchId: "11111111-1111-4111-8111-111111111111",
  onHand: 0,
  reserved: 0,
  available: 0,
  reorderPoint: 2,
  lastUpdatedAt: "2026-09-05T12:00:01.000Z",
};

describe("inventory realtime merge", () => {
  it("applies a current stock event and recalculates AGOTADO and low-stock totals", () => {
    const result = mergeStockUpdated(dashboard, stockUpdated, "2026-09-05T12:00:02.000Z");

    expect(result.applied).toBe(true);
    expect(result.dashboard.items[0]?.available).toBe(0);
    expect(result.dashboard.lowStock).toHaveLength(1);
    expect(result.dashboard.summary).toEqual({ onHand: 0, reserved: 0, available: 0, lowStock: 1, outOfStock: 1 });
  });

  it("does not overwrite a newer dashboard snapshot with a stale event", () => {
    const result = mergeStockUpdated(dashboard, { ...stockUpdated, lastUpdatedAt: "2026-09-05T11:59:59.000Z" });

    expect(result.applied).toBe(false);
    expect(result.dashboard).toBe(dashboard);
  });

  it("tracks a bounded p95 delivery measurement from the event timestamp", () => {
    const first = recordRealtimeLatency([], "2026-09-05T12:00:00.000Z", Date.parse("2026-09-05T12:00:00.100Z"));
    const second = recordRealtimeLatency(first.samples, "2026-09-05T12:00:00.000Z", Date.parse("2026-09-05T12:00:01.500Z"));

    expect(second.latency).toEqual({ lastMilliseconds: 1_500, p95Milliseconds: 1_500, sampleSize: 2 });
  });
});
