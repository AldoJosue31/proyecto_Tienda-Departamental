import { describe, expect, it, vi } from "vitest";
import { PricingOutboxService } from "../src/events/outbox.service";

describe("Pricing outbox survives database failure", () => {
  it("contains a failed claim and retries after recovery without a stuck flush lock", async () => {
    const transaction = vi.fn().mockRejectedValueOnce(new Error("database offline")).mockImplementationOnce(async (run: (client: unknown) => unknown) => run({ query: async () => ({ rows: [] }) }));
    const outbox = new PricingOutboxService({ withTransaction: transaction } as never, { environment: "integration", rabbitmqUrl: "amqp://unused", outboxPublishIntervalMilliseconds: 1000 });
    await expect(outbox.flush()).resolves.toBeUndefined();
    await expect(outbox.flush()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
