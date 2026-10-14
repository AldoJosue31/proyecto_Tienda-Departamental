import type { ConfirmChannel, ConsumeMessage } from "amqplib";

export async function consumeReliably<T>(
  channel: ConfirmChannel, queue: string, message: ConsumeMessage | null,
  parse: (value: unknown) => T, apply: (event: T) => Promise<void>,
  warn: (message: string) => void,
  delay: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
): Promise<void> {
  if (!message) return;
  let event: T;
  try { event = parse(JSON.parse(message.content.toString("utf8")) as unknown); }
  catch { warn("An invalid event was retained in the DLQ."); try { channel.nack(message, false, false); } catch { /* closed channels requeue unacked jobs */ } return; }
  try { await apply(event); channel.ack(message); }
  catch {
    const previous = message.properties.headers?.["x-projection-attempt"];
    const attempt = typeof previous === "number" && Number.isSafeInteger(previous) && previous >= 0 ? previous : 0;
    if (attempt >= 5) { warn("A valid event exhausted projection retries and was retained in the DLQ."); try { channel.nack(message, false, false); } catch { /* closed channel */ } return; }
    warn("A valid event will retry after its dependency recovers.");
    try {
      await delay(Math.min(30000, 1000 * 2 ** attempt));
      channel.sendToQueue(queue, message.content, { ...message.properties, persistent: true, headers: { ...message.properties.headers, "x-projection-attempt": attempt + 1 } });
      await channel.waitForConfirms();
      channel.ack(message);
    } catch { try { channel.nack(message, false, true); } catch { /* broker preserves unacknowledged jobs */ } }
  }
}
