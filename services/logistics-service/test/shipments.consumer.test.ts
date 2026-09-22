import { describe, expect, it } from "vitest";

import { ShipmentsConsumer } from "../src/shipments/shipments.consumer";
import type { LogisticsEvent } from "../src/shipments/shipments.types";

const orderId = "d1000000-0000-4000-8000-000000000001";
const customerId = "f1000000-0000-4000-8000-000000000001";
const branchId = "b1000000-0000-4000-8000-000000000001";
const productId = "a1000000-0000-4000-8000-000000000001";
const variantId = "a2000000-0000-4000-8000-000000000001";
const eventId = "e1000000-0000-4000-8000-000000000001";

function parse(value: unknown): LogisticsEvent {
  const consumer = new ShipmentsConsumer(
    { project: async () => undefined } as never,
    { environment: "test", rabbitmqUrl: "amqp://unused" },
  );
  return Reflect.get(consumer, "event").call(consumer, value) as LogisticsEvent;
}

function completed(channel: unknown): Record<string, unknown> {
  return {
    eventId,
    eventType: "order.completed.v1",
    occurredAt: "2026-09-22T12:00:00.000Z",
    correlationId: "test",
    producer: "orders-service",
    data: {
      orderId,
      customerId,
      branchId,
      channel,
      currency: "MXN",
      total: 1_499,
      items: [{ productId, variantId, productName: "Lámpara", sku: "LUM-01", variantLabel: "Arena", quantity: 1, lineTotal: 1_499 }],
    },
  };
}

describe("contrato de eventos de Orders", () => {
  it("conserva el canal físico para que Logistics no lo convierta en envío", () => {
    const event = parse(completed("PHYSICAL"));
    expect(event).toMatchObject({ eventType: "order.completed.v1", channel: "PHYSICAL" });
  });

  it("envía a DLQ un pedido completado sin canal o con un canal inválido", () => {
    expect(() => parse(completed(undefined))).toThrow("Invalid completed order event.");
    expect(() => parse(completed("DELIVERY"))).toThrow("Invalid completed order event.");
  });
});
