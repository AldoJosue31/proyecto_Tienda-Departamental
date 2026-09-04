import { describe, expect, it, vi } from "vitest";

import { AnalyticsService } from "../src/analytics/analytics.service";

describe("AnalyticsService", () => {
  it("conserva sucursales con ventas cero y reporta la última proyección", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [
        { branch_id: "1a7ed23a-1e3a-4f7f-b268-606fd9c7d70e", branch_name: "Centro", sales: "1250.50", completed_orders: "2" },
        { branch_id: "4f8ac1c0-6d26-4f3b-8aec-6bb9b68ad1a9", branch_name: "Norte", sales: "0", completed_orders: "0" },
      ] })
      .mockResolvedValueOnce({ rows: [{ last_updated_at: new Date("2026-09-03T12:00:00.000Z") }] });
    const service = new AnalyticsService({ query } as never);

    await expect(service.salesByBranch("today", "mxn")).resolves.toMatchObject({
      currency: "MXN",
      branches: [
        { branchName: "Centro", sales: 1250.5, completedOrders: 2 },
        { branchName: "Norte", sales: 0, completedOrders: 0 },
      ],
      lastUpdatedAt: "2026-09-03T12:00:00.000Z",
    });
  });

  it("rechaza límites de ranking distintos de 5, 10 y 20", async () => {
    const service = new AnalyticsService({ query: vi.fn() } as never);
    await expect(service.topProducts("today", "7", "MXN")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
