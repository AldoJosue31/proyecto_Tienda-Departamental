import { describe, expect, it, vi } from "vitest";
import { CrmService } from "../src/crm/crm.service";

describe("CrmService", () => {
  it("segmenta por defecto compras cuya última actividad supera tres meses", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ customer_id: "b2d06ae4-7847-4b8d-b218-0b98f950ff44", first_purchase_at: new Date("2025-11-01T00:00:00.000Z"), last_purchase_at: new Date("2026-04-01T00:00:00.000Z"), completed_orders: "2", lifetime_total: "970.50", currency: "MXN", updated_at: new Date("2026-04-01T00:00:00.000Z") }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [{ last_updated_at: new Date("2026-04-01T00:00:00.000Z") }] });
    const service = new CrmService({ query } as never);

    await expect(service.inactiveSegment(undefined, new Date("2026-09-04T00:00:00.000Z"))).resolves.toMatchObject({
      count: 1,
      segment: { months: 3, includesNeverPurchased: false, cutoffAt: "2026-06-04T00:00:00.000Z" },
      customers: [{ customerId: "b2d06ae4-7847-4b8d-b218-0b98f950ff44", completedOrders: 2, lifetimeTotal: 970.5 }],
    });
  });

  it("rechaza periodos de segmentación fuera del rango soportado", async () => {
    const service = new CrmService({ query: vi.fn() } as never);
    await expect(service.inactiveSegment("0")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.inactiveSegment("61")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
