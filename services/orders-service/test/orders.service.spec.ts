import { describe, expect, it, vi } from "vitest";

import { ApiException } from "../src/common/api-exception";
import type { DatabaseService } from "../src/database/database.service";
import { OrdersService } from "../src/orders/orders.service";
import type { StoredOrder } from "../src/orders/orders.types";

const actor = {
  id: "f1000000-0000-4000-8000-000000000001",
  role: "CUSTOMER" as const,
  correlationId: "test",
};

const orderId = "d1000000-0000-4000-8000-000000000001";
const productId = "a1000000-0000-4000-8000-000000000001";
const variantId = "a2000000-0000-4000-8000-000000000001";
const branchId = "b1000000-0000-4000-8000-000000000001";

function order(status: StoredOrder["status"] = "PENDING"): StoredOrder {
  return {
    id: orderId,
    customerId: actor.id,
    createdBy: actor.id,
    createdByRole: actor.role,
    branchId,
    status,
    currency: "MXN",
    subtotal: 0,
    discountTotal: 0,
    total: 0,
    cancellationReason: null,
    cancelledAt: null,
    version: 1,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    items: [],
  };
}

function database() {
  return {
    withAdvisoryLock: async <T>(_key: string, operation: (client: never) => Promise<T>) => operation(undefined as never),
    withTransactionOnClient: async <T>(_client: never, operation: (client: never) => Promise<T>) => operation(undefined as never),
  } as unknown as DatabaseService;
}

describe("OrdersService idempotency and ownership", () => {
  it("devuelve el pedido confirmado previo sin volver a llamar servicios remotos", async () => {
    const confirmed = order("CONFIRMED");
    const repository = {
      findIdempotency: vi.fn().mockResolvedValue({
        actorId: actor.id,
        idempotencyKey: "checkout-1",
        requestHash: "cd7c49679bdf1717ae630159d2febb26720b3c87409bc52e61f354596b973e35",
        orderId,
        outcomeCode: null,
        outcomeMessage: null,
      }),
      findByIdForClient: vi.fn().mockResolvedValue(confirmed),
    };
    const catalog = { getVariant: vi.fn() };
    const pricing = { quote: vi.fn() };
    const inventory = { reserve: vi.fn() };
    const service = new OrdersService(
      database(),
      repository as never,
      catalog as never,
      pricing as never,
      inventory as never,
      { enqueue: vi.fn() } as never,
    );

    const result = await service.create({
      branchId,
      items: [{ productId, variantId, quantity: 1 }],
    }, "checkout-1", actor);

    expect(result.order.id).toBe(orderId);
    expect(catalog.getVariant).not.toHaveBeenCalled();
    expect(pricing.quote).not.toHaveBeenCalled();
    expect(inventory.reserve).not.toHaveBeenCalled();
  });

  it("impide que un CUSTOMER consulte un pedido ajeno", async () => {
    const foreign = { ...order("CONFIRMED"), customerId: "f1000000-0000-4000-8000-000000000002" };
    const repository = { findById: vi.fn().mockResolvedValue(foreign) };
    const service = new OrdersService(
      database(),
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      { enqueue: vi.fn() } as never,
    );

    await expect(service.get(orderId, actor)).rejects.toMatchObject(
      { code: "FORBIDDEN" } satisfies Partial<ApiException>,
    );
  });

  it("persiste el rechazo cuando Inventory informa OUT_OF_STOCK", async () => {
    const pending = order();
    const repository = {
      findIdempotency: vi.fn().mockResolvedValue(null),
      createDraft: vi.fn().mockResolvedValue(pending),
      replaceItems: vi.fn(async (_client: unknown, _id: string, snapshots: Array<{
        productId: string; categoryId: string; variantId: string; branchId: string; productName: string;
        sku: string; variantLabel: string; quantity: number; listUnitPrice: number; unitPrice: number;
        lineDiscountTotal: number; lineTotal: number; currency: string;
      }>) => {
        pending.items = snapshots.map((snapshot) => ({ id: "line-1", ...snapshot, reservationId: null }));
      }),
      audit: vi.fn(),
      findByIdForClient: vi.fn().mockImplementation(async () => pending),
      failOutOfStock: vi.fn(async () => {
        pending.status = "CANCELLED";
      }),
    };
    const catalog = {
      getVariant: vi.fn().mockResolvedValue({
        productId,
        categoryId: "c1000000-0000-4000-8000-000000000001",
        productName: "Producto de prueba",
        variantId,
        sku: "TEST-01",
        variantLabel: "Única",
        listPrice: 120,
        currency: "MXN",
      }),
    };
    const pricing = {
      quote: vi.fn().mockResolvedValue({ basePrice: 120, effectivePrice: 100, currency: "MXN" }),
    };
    const inventory = {
      reserve: vi.fn().mockRejectedValue(
        new ApiException(409, "OUT_OF_STOCK", "Una o más líneas ya no tienen existencias suficientes"),
      ),
      release: vi.fn(),
    };
    const service = new OrdersService(
      database(),
      repository as never,
      catalog as never,
      pricing as never,
      inventory as never,
      { enqueue: vi.fn() } as never,
    );

    await expect(service.create({
      branchId,
      items: [{ productId, variantId, quantity: 1 }],
    }, "checkout-out-of-stock", actor)).rejects.toMatchObject(
      { code: "OUT_OF_STOCK" } satisfies Partial<ApiException>,
    );
    expect(repository.failOutOfStock).toHaveBeenCalledOnce();
    expect(inventory.release).not.toHaveBeenCalled();
  });

  it("registra order.cancelled.v1 dentro de la transacción de una venta confirmada", async () => {
    let current: StoredOrder = {
      ...order("CONFIRMED"),
      items: [{
        id: "line-1",
        productId,
        categoryId: "c1000000-0000-4000-8000-000000000001",
        variantId,
        branchId,
        productName: "Producto de prueba",
        sku: "TEST-01",
        variantLabel: "Única",
        quantity: 1,
        listUnitPrice: 120,
        unitPrice: 100,
        lineDiscountTotal: 20,
        lineTotal: 100,
        currency: "MXN",
        reservationId: "d1000000-0000-4000-8000-000000000002",
      }],
    };
    const repository = {
      findByIdForClient: vi.fn().mockImplementation(async () => current),
      cancel: vi.fn(async () => {
        current = { ...current, status: "CANCELLED" };
      }),
    };
    const outbox = { enqueue: vi.fn() };
    const service = new OrdersService(
      database(),
      repository as never,
      {} as never,
      {} as never,
      { release: vi.fn() } as never,
      outbox as never,
    );

    const result = await service.cancel(orderId, actor, "Cambio de decisión");

    expect(result.order.status).toBe("CANCELLED");
    expect(outbox.enqueue).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        eventType: "order.cancelled.v1",
        data: expect.objectContaining({ orderId, status: "CANCELLED" }),
      }),
    );
  });
});
