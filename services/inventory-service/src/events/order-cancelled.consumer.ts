import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from "amqplib";

import { INVENTORY_RUNTIME_CONFIG } from "../auth/token.service";
import type { InventoryRuntimeConfig } from "../config/environment";
import { InventoryService, type OrderCancelledEvent } from "../inventory/inventory.service";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const ROUTING_KEY = "order.cancelled.v1";
const QUEUE = "inventory.order-cancelled.v1";
const RETRY_QUEUE = QUEUE + ".retry";
const DEAD_LETTER_QUEUE = QUEUE + ".dlq";

@Injectable()
export class OrderCancelledConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderCancelledConsumer.name);
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly inventory: InventoryService,
    @Inject(INVENTORY_RUNTIME_CONFIG)
    private readonly config: Pick<
      InventoryRuntimeConfig,
      "environment" | "rabbitmqUrl" | "consumerRetryLimit"
    >,
  ) {}

  onModuleInit(): void {
    if (this.config.environment === "test") return;
    void this.start();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.channel = null;
    const connection = this.connection;
    this.connection = null;
    if (connection) await connection.close().catch(() => undefined);
  }

  private async start(): Promise<void> {
    if (this.channel || this.config.environment === "test") return;
    try {
      const connection = await connect(this.config.rabbitmqUrl);
      connection.on("error", () => this.clearConnection(connection));
      connection.on("close", () => this.clearConnection(connection));
      const channel = await connection.createConfirmChannel();
      channel.on("error", () => this.clearConnection(connection));
      channel.on("close", () => this.clearConnection(connection));
      await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
      await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true });
      await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
      await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, DEAD_LETTER_QUEUE);
      await channel.assertQueue(QUEUE, {
        durable: true,
        arguments: {
          "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE,
          "x-dead-letter-routing-key": DEAD_LETTER_QUEUE,
        },
      });
      await channel.bindQueue(QUEUE, EVENTS_EXCHANGE, ROUTING_KEY);
      await channel.assertQueue(RETRY_QUEUE, {
        durable: true,
        arguments: {
          "x-message-ttl": 1_000,
          "x-dead-letter-exchange": EVENTS_EXCHANGE,
          "x-dead-letter-routing-key": ROUTING_KEY,
        },
      });
      await channel.prefetch(8);
      await channel.consume(QUEUE, (message) => void this.handle(message), { noAck: false });
      this.connection = connection;
      this.channel = channel;
    } catch {
      this.logger.warn("Inventory event consumer will retry its RabbitMQ connection.");
      this.scheduleReconnect();
    }
  }

  private async handle(message: ConsumeMessage | null): Promise<void> {
    if (!message) return;
    const channel = this.channel;
    if (!channel) return;
    let event: OrderCancelledEvent;
    try {
      event = this.decode(message);
    } catch {
      channel.nack(message, false, false);
      return;
    }
    try {
      await this.inventory.restoreCancelledOrder(event);
      channel.ack(message);
    } catch {
      const retries = this.retryCount(message);
      if (retries >= this.config.consumerRetryLimit) {
        channel.nack(message, false, false);
        this.logger.error("Inventory moved an order cancellation event to its DLQ.");
        return;
      }
      try {
        channel.sendToQueue(RETRY_QUEUE, message.content, {
          contentType: "application/json",
          deliveryMode: 2,
          messageId: event.eventId,
          type: event.eventType,
          headers: { ...message.properties.headers, "x-retry-count": retries + 1 },
        });
        await channel.waitForConfirms();
        channel.ack(message);
      } catch {
        channel.nack(message, false, true);
      }
    }
  }

  private decode(message: ConsumeMessage): OrderCancelledEvent {
    const parsed: unknown = JSON.parse(message.content.toString("utf8"));
    if (!this.object(parsed) || parsed.eventType !== ROUTING_KEY || parsed.producer !== "orders-service") {
      throw new Error("Unexpected event envelope.");
    }
    if (
      typeof parsed.eventId !== "string"
      || typeof parsed.occurredAt !== "string"
      || !this.object(parsed.data)
    ) {
      throw new Error("Invalid event envelope.");
    }
    return {
      eventId: parsed.eventId,
      eventType: ROUTING_KEY,
      occurredAt: parsed.occurredAt,
      correlationId: typeof parsed.correlationId === "string" ? parsed.correlationId : null,
      producer: "orders-service",
      data: parsed.data,
    };
  }

  private retryCount(message: ConsumeMessage): number {
    const value = message.properties.headers?.["x-retry-count"];
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  private object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private clearConnection(connection: ChannelModel): void {
    if (this.connection === connection) {
      this.connection = null;
      this.channel = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.retryTimer || this.config.environment === "test") return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.start();
    }, 5_000);
    this.retryTimer.unref();
  }
}
