import type { Channel, ConsumeMessage } from "amqplib";
import { describe, expect, it, vi } from "vitest";
import { InventoryStockConsumer } from "../src/realtime/inventory-stock.consumer";

describe("inventory realtime consumer version contract", () => {
  it("acknowledges duplicates and reversed or legacy messages without broadcasting them", () => {
    const broadcastStockUpdated = vi.fn();
    const consumer = new InventoryStockConsumer({ broadcastStockUpdated } as never, { environment: "test", rabbitmqUrl: "amqp://localhost" });
    const channel = { ack: vi.fn(), nack: vi.fn() };
    const envelope = { eventType: "inventory.stock.changed.v1", producer: "inventory-service", occurredAt: "2026-10-09T00:00:00Z", correlationId: null, data: { branchId: "b1000000-0000-4000-8000-000000000001", variantId: "a2000000-0000-4000-8000-000000000001", onHand: 0, reserved: 0, available: 0, reorderPoint: 2, lastUpdatedAt: "2026-10-09T00:00:00Z", revision: 5 } };
    const consume = consumer as unknown as { consume(channel: Channel, message: ConsumeMessage): void };
    const send = (eventId: string, revision?: number) => consume.consume(channel as unknown as Channel, { content: Buffer.from(JSON.stringify({ ...envelope, eventId, data: { ...envelope.data, revision } })) } as ConsumeMessage);
    send("f1000000-0000-4000-8000-000000000001", 5);
    send("f1000000-0000-4000-8000-000000000001", 5);
    send("f1000000-0000-4000-8000-000000000002", 4);
    send("f1000000-0000-4000-8000-000000000003");
    send("f1000000-0000-4000-8000-000000000004", 6);
    expect(broadcastStockUpdated).toHaveBeenCalledTimes(2);
    expect(broadcastStockUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 6 }));
    expect(channel.ack).toHaveBeenCalledTimes(5);
    expect(channel.nack).not.toHaveBeenCalled();
  });
});
