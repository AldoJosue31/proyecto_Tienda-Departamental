import { describe, expect, it, vi } from "vitest";
import { OrdersService } from "../src/orders/orders.service";

describe("Orders validates displayed price before stock consumption", () => {
  it("rejects changed prices before reservation and records a replayable failure", async () => {
    const productId = "a1000000-0000-4000-8000-000000000001", variantId = "a2000000-0000-4000-8000-000000000001", branchId = "b1000000-0000-4000-8000-000000000001";
    const actor = { id: productId, role: "CUSTOMER" as const, correlationId: null };
    const draft = { id: branchId, customerId: actor.id, branchId, channel: "ONLINE", status: "PENDING", items: [] };
    const database = { withAdvisoryLock: (_key: unknown, run: (client: unknown) => unknown) => run({}), withTransactionOnClient: (_client: unknown, run: (client: unknown) => unknown) => run({}) };
    const repository = { findIdempotency: vi.fn().mockResolvedValue(null), createDraft: vi.fn().mockResolvedValue(draft), failOutOfStock: vi.fn() };
    const inventory = { reserve: vi.fn() };
    const service = new OrdersService(database as never, repository as never, { getVariant: async () => ({ productId, variantId, categoryId: productId, listPrice: 100, currency: "MXN", productName: "Prueba", sku: "PRU", variantLabel: "M" }) } as never, { quote: async () => ({ basePrice: 100, effectivePrice: 90, currency: "MXN" }) } as never, inventory as never, {} as never);
    await expect(service.create({ branchId, expectedTotal: 100, items: [{ productId, variantId, quantity: 1 }] }, "displayed-price", actor)).rejects.toMatchObject({ code: "PRICE_CHANGED", status: 409 });
    expect(inventory.reserve).not.toHaveBeenCalled();
    expect(repository.failOutOfStock).toHaveBeenCalledWith(expect.anything(), branchId, actor, "PRICE_CHANGED", expect.any(String));
  });
});
