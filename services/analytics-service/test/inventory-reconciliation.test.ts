import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryReconciliationService } from "../src/analytics/inventory-reconciliation.service";

const branch = { id: "b1000000-0000-4000-8000-000000000001", name: "Sucursal Centro" };
const item = { variantId: "a2000000-0000-4000-8000-000000000001", branch, onHand: 1, reserved: 0, available: 1, revision: 1, lastUpdatedAt: "2026-10-09T00:00:00Z" };
const config = { environment: "test", inventoryServiceUrl: "http://inventory.test", inventoryServiceKey: "test-internal-key", inventorySyncIntervalSeconds: 30 };
afterEach(() => vi.unstubAllGlobals());

describe("inventory reconciliation recovery", () => {
  it("imports every page and records completion only after reaching coverage", async () => {
    const cursor = "e1000000-0000-4000-8000-000000000001";
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ branches: [branch], items: [item], total: 2, nextCursor: cursor }))
      .mockResolvedValueOnce(Response.json({ branches: [branch], items: [{ ...item, variantId: "a2000000-0000-4000-8000-000000000002" }], total: 2, nextCursor: null }));
    vi.stubGlobal("fetch", fetcher);
    const query = vi.fn().mockResolvedValue({ rows: [] }); const importInventory = vi.fn().mockResolvedValue(undefined);
    const service = new InventoryReconciliationService({ query } as never, { importInventory } as never, {} as never, config);
    await service.reconcile();
    expect(new URL(String(fetcher.mock.calls[1]?.[0])).searchParams.get("cursor")).toBe(cursor);
    expect(importInventory).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("completed_at = NOW()"));
  });
  it("keeps a failed import pending and completes on a later retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("offline", { status: 503 })).mockResolvedValueOnce(Response.json({ branches: [branch], items: [item], total: 1, nextCursor: null })));
    const query = vi.fn().mockResolvedValue({ rows: [] }); const importInventory = vi.fn().mockResolvedValue(undefined);
    const service = new InventoryReconciliationService({ query } as never, { importInventory } as never, {} as never, config);
    await service.reconcile();
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("last_error = 'Inventory reconciliation"));
    expect(importInventory).not.toHaveBeenCalled();
    await service.reconcile();
    expect(importInventory).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("completed_at = NOW()"));
  });
  it("does not report complete when the source changes during pagination", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ branches: [branch], items: [item], total: 2, nextCursor: null })));
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = new InventoryReconciliationService({ query } as never, { importInventory: vi.fn() } as never, {} as never, config);
    await service.reconcile();
    expect(query.mock.calls.some(([sql]) => String(sql).includes("completed_at = NOW()"))).toBe(false);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("last_error = 'Inventory reconciliation"));
  });
});
