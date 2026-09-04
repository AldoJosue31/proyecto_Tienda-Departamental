import { afterEach, describe, expect, it, vi } from "vitest";

import { InventoryClient } from "../src/orders/inventory.client";

describe("InventoryClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envía únicamente el DTO de reserva; la idempotencia y correlación viajan en headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      reservation: { id: "d1000000-0000-4000-8000-000000000001", status: "RESERVED" },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new InventoryClient({
      inventoryServiceUrl: "http://inventory-service:3003",
      inventoryInternalServiceKey: "service-key",
      upstreamTimeoutMilliseconds: 5_000,
    });

    await client.reserve({
      variantId: "a2000000-0000-4000-8000-000000000001",
      branchId: "b1000000-0000-4000-8000-000000000001",
      orderId: "d1000000-0000-4000-8000-000000000001",
      quantity: 2,
      idempotencyKey: "checkout-1",
      correlationId: "correlation-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://inventory-service:3003/inventory/reservations"),
      expect.objectContaining({
        body: JSON.stringify({
          variantId: "a2000000-0000-4000-8000-000000000001",
          branchId: "b1000000-0000-4000-8000-000000000001",
          orderId: "d1000000-0000-4000-8000-000000000001",
          quantity: 2,
        }),
        headers: expect.objectContaining({
          "idempotency-key": "checkout-1",
          "x-correlation-id": "correlation-1",
        }),
      }),
    );
  });
});
