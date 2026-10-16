import { describe, expect, it, vi } from "vitest";
import { consumeReliably } from "../src/common/consume-reliably";

const job = (attempt = 0) => ({ content: Buffer.from('{"value":1}'), properties: { messageId: "stable-id", headers: { "x-projection-attempt": attempt } } });
const channel = () => ({ ack: vi.fn(), nack: vi.fn(), sendToQueue: vi.fn(), waitForConfirms: vi.fn().mockResolvedValue(undefined) });
describe("durable projection failures", () => {
  it("confirms a retry before ack and preserves its message ID", async () => {
    const bus = channel(), order: string[] = []; bus.waitForConfirms.mockImplementation(async () => { order.push("confirmed"); }); bus.ack.mockImplementation(() => { order.push("acked"); });
    await consumeReliably(bus as never, "projection", job() as never, value => value, async () => { throw new Error("PostgreSQL offline"); }, vi.fn(), async () => {});
    expect(order).toEqual(["confirmed", "acked"]);
    expect(bus.sendToQueue).toHaveBeenCalledWith("projection", expect.any(Buffer), expect.objectContaining({ messageId: "stable-id", persistent: true, headers: { "x-projection-attempt": 1 } }));
  });
  it("retains invalid payloads and exhausted valid retries in DLQ", async () => {
    const invalid = channel(), exhausted = channel();
    await consumeReliably(invalid as never, "projection", job() as never, () => { throw new Error("invalid envelope"); }, vi.fn(), vi.fn(), async () => {});
    await consumeReliably(exhausted as never, "projection", job(5) as never, value => value, async () => { throw new Error("still offline"); }, vi.fn(), async () => {});
    expect(invalid.nack).toHaveBeenCalledWith(expect.anything(), false, false); expect(exhausted.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(invalid.sendToQueue).not.toHaveBeenCalled(); expect(exhausted.sendToQueue).not.toHaveBeenCalled();
  });
  it("requeues the original when broker confirmation fails", async () => {
    const bus = channel(); bus.waitForConfirms.mockRejectedValueOnce(new Error("broker disconnected"));
    await consumeReliably(bus as never, "projection", job() as never, value => value, async () => { throw new Error("database offline"); }, vi.fn(), async () => {});
    expect(bus.ack).not.toHaveBeenCalled(); expect(bus.nack).toHaveBeenCalledWith(expect.anything(), false, true);
  });
});
