import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";

import { REALTIME_RUNTIME_CONFIG } from "../auth/token.service";
import type { RealtimeRuntimeConfig } from "../config/environment";
import { RealtimeGateway } from "./realtime.gateway";
import type { RealtimeEventEnvelope, StockUpdatedEvent } from "./realtime.types";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const QUEUE = "realtime.inventory-stock.v1";
const DEAD_LETTER_QUEUE = QUEUE + ".dlq";
const MAX_REMEMBERED_EVENTS = 5_000;

@Injectable()
export class InventoryStockConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryStockConsumer.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly processedEventIds = new Set<string>();

  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    @Inject(REALTIME_RUNTIME_CONFIG)
    private readonly config: Pick<RealtimeRuntimeConfig, "environment" | "rabbitmqUrl">,
  ) {}

  onModuleInit(): void {
    if (this.config.environment === "test") return;
    void this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.channel = null;
    const connection = this.connection;
    this.connection = null;
    if (connection) await connection.close().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    try {
      const connection = await connect(this.config.rabbitmqUrl);
      const channel = await connection.createChannel();
      connection.on("error", () => this.clearConnection(connection));
      connection.on("close", () => this.clearConnection(connection));
      channel.on("error", () => this.clearConnection(connection));
      channel.on("close", () => this.clearConnection(connection));
      await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
      await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true });
      await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
      await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, "inventory.stock.changed.v1");
      await channel.assertQueue(QUEUE, {
        durable: true,
        arguments: { "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE },
      });
      await channel.bindQueue(QUEUE, EVENTS_EXCHANGE, "inventory.stock.changed.v1");
      this.connection = connection;
      this.channel = channel;
      await channel.consume(QUEUE, (message) => this.consume(channel, message), { noAck: false });
    } catch {
      this.logger.warn("Realtime event consumer is reconnecting after RabbitMQ becomes available.");
      const retry = setTimeout(() => void this.connect(), 1_000);
      retry.unref();
    }
  }

  private consume(channel: Channel, message: ConsumeMessage | null): void {
    if (!message) return;
    try {
      const update = this.toStockUpdated(JSON.parse(message.content.toString("utf8")) as unknown);
      if (!this.processedEventIds.has(update.eventId)) {
        this.remember(update.eventId);
        this.realtimeGateway.broadcastStockUpdated(update);
      }
      channel.ack(message);
    } catch {
      this.logger.warn("An invalid inventory event was sent to the Realtime DLQ.");
      channel.nack(message, false, false);
    }
  }

  private toStockUpdated(value: unknown): StockUpdatedEvent {
    if (!this.isEnvelope(value)) throw new Error("Invalid event envelope.");
    const data = value.data;
    const reorderPoint = data.reorderPoint;
    if (
      !this.isUuid(value.eventId)
      || !this.isUuid(data.variantId)
      || !this.isUuid(data.branchId)
      || !this.isNonnegativeInteger(data.onHand)
      || !this.isNonnegativeInteger(data.reserved)
      || !this.isNonnegativeInteger(data.available)
      || (reorderPoint !== null && !this.isNonnegativeInteger(reorderPoint))
      || typeof data.lastUpdatedAt !== "string"
      || Number.isNaN(Date.parse(data.lastUpdatedAt))
      || data.available !== data.onHand - data.reserved
    ) {
      throw new Error("Invalid inventory event data.");
    }
    return {
      eventId: value.eventId,
      occurredAt: value.occurredAt,
      correlationId: value.correlationId,
      variantId: data.variantId,
      branchId: data.branchId,
      onHand: data.onHand,
      reserved: data.reserved,
      available: data.available,
      reorderPoint,
      lastUpdatedAt: data.lastUpdatedAt,
    };
  }

  private isEnvelope(value: unknown): value is RealtimeEventEnvelope {
    if (typeof value !== "object" || value === null) return false;
    const event = value as Record<string, unknown>;
    return event.eventType === "inventory.stock.changed.v1"
      && event.producer === "inventory-service"
      && typeof event.eventId === "string"
      && typeof event.occurredAt === "string"
      && (typeof event.correlationId === "string" || event.correlationId === null)
      && typeof event.data === "object" && event.data !== null;
  }

  private remember(eventId: string): void {
    this.processedEventIds.add(eventId);
    if (this.processedEventIds.size <= MAX_REMEMBERED_EVENTS) return;
    const oldest = this.processedEventIds.values().next().value;
    if (oldest) this.processedEventIds.delete(oldest);
  }

  private clearConnection(connection: ChannelModel): void {
    if (this.connection !== connection) return;
    this.connection = null;
    this.channel = null;
    const retry = setTimeout(() => void this.connect(), 1_000);
    retry.unref();
  }

  private isUuid(value: unknown): value is string {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private isNonnegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  }
}
