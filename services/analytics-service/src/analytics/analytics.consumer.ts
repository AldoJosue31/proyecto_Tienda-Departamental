import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { ANALYTICS_RUNTIME_CONFIG } from "../auth/token.service";
import type { AnalyticsRuntimeConfig } from "../config/environment";
import { AnalyticsService } from "./analytics.service";
import type { AnalyticsEvent, CancelledOrderEvent, CompletedOrderEvent, StockChangedEvent } from "./analytics.types";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const QUEUE = "analytics.projections.v1";
const DLQ = QUEUE + ".dlq";
const ROUTING_KEYS = ["order.completed.v1", "order.cancelled.v1", "inventory.stock.changed.v1"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AnalyticsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsConsumer.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  constructor(private readonly analytics: AnalyticsService, @Inject(ANALYTICS_RUNTIME_CONFIG) private readonly config: Pick<AnalyticsRuntimeConfig, "environment" | "rabbitmqUrl">) {}
  onModuleInit(): void { if (this.config.environment !== "test") void this.connect(); }
  async onModuleDestroy(): Promise<void> { this.channel = null; const connection = this.connection; this.connection = null; if (connection) await connection.close().catch(() => undefined); }
  private async connect(): Promise<void> {
    try {
      const connection = await connect(this.config.rabbitmqUrl); const channel = await connection.createChannel();
      connection.on("error", () => this.clear(connection)); connection.on("close", () => this.clear(connection)); channel.on("error", () => this.clear(connection)); channel.on("close", () => this.clear(connection));
      await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true }); await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true });
      await channel.assertQueue(DLQ, { durable: true }); for (const key of ROUTING_KEYS) await channel.bindQueue(DLQ, DEAD_LETTER_EXCHANGE, key);
      await channel.assertQueue(QUEUE, { durable: true, arguments: { "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE } }); for (const key of ROUTING_KEYS) await channel.bindQueue(QUEUE, EVENTS_EXCHANGE, key);
      this.connection = connection; this.channel = channel; await channel.consume(QUEUE, (message) => void this.consume(channel, message), { noAck: false });
    } catch { this.logger.warn("Analytics event consumer is reconnecting after RabbitMQ becomes available."); const retry = setTimeout(() => void this.connect(), 1_000); retry.unref(); }
  }
  private async consume(channel: Channel, message: ConsumeMessage | null): Promise<void> {
    if (!message) return;
    try { await this.analytics.project(this.event(JSON.parse(message.content.toString("utf8")) as unknown)); channel.ack(message); }
    catch { this.logger.warn("An invalid analytics event was sent to the DLQ."); channel.nack(message, false, false); }
  }
  private event(value: unknown): AnalyticsEvent {
    if (!this.object(value) || !this.uuid(value.eventId) || !this.date(value.occurredAt) || (typeof value.correlationId !== "string" && value.correlationId !== null) || !this.object(value.data)) throw new Error("Invalid event envelope.");
    const data = value.data;
    if (value.eventType === "order.completed.v1" && value.producer === "orders-service") return this.completed(value, data);
    if (value.eventType === "order.cancelled.v1" && value.producer === "orders-service") return this.cancelled(value, data);
    if (value.eventType === "inventory.stock.changed.v1" && value.producer === "inventory-service") return this.stock(value, data);
    throw new Error("Unexpected analytics event type.");
  }
  private completed(value: Record<string, unknown>, data: Record<string, unknown>): CompletedOrderEvent {
    if (!this.uuid(data.orderId) || !this.uuid(data.branchId) || typeof data.currency !== "string" || !/^[A-Z]{3}$/.test(data.currency) || !this.money(data.total) || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 100) throw new Error("Invalid completed order event.");
    const items = data.items.map((item) => {
      if (!this.object(item) || !this.uuid(item.productId) || !this.uuid(item.variantId) || typeof item.productName !== "string" || !item.productName.trim() || !this.positiveInteger(item.quantity) || !this.money(item.lineTotal)) throw new Error("Invalid completed order item.");
      return { productId: item.productId, variantId: item.variantId, productName: item.productName.trim(), quantity: item.quantity, lineTotal: item.lineTotal };
    });
    return { eventId: value.eventId as string, eventType: "order.completed.v1", occurredAt: value.occurredAt as string, correlationId: value.correlationId as string | null, orderId: data.orderId, branchId: data.branchId, currency: data.currency, total: data.total, items };
  }
  private cancelled(value: Record<string, unknown>, data: Record<string, unknown>): CancelledOrderEvent {
    if (!this.uuid(data.orderId)) throw new Error("Invalid cancelled order event.");
    return { eventId: value.eventId as string, eventType: "order.cancelled.v1", occurredAt: value.occurredAt as string, correlationId: value.correlationId as string | null, orderId: data.orderId };
  }
  private stock(value: Record<string, unknown>, data: Record<string, unknown>): StockChangedEvent {
    if (!this.uuid(data.variantId) || !this.uuid(data.branchId) || !this.nonnegativeInteger(data.onHand) || !this.nonnegativeInteger(data.reserved) || !this.nonnegativeInteger(data.available) || data.available !== data.onHand - data.reserved || !this.date(data.lastUpdatedAt) || (data.branchName !== undefined && typeof data.branchName !== "string")) throw new Error("Invalid inventory stock event.");
    return { eventId: value.eventId as string, eventType: "inventory.stock.changed.v1", occurredAt: value.occurredAt as string, correlationId: value.correlationId as string | null, variantId: data.variantId, branchId: data.branchId, branchName: typeof data.branchName === "string" ? data.branchName.trim() : undefined, onHand: data.onHand, reserved: data.reserved, available: data.available, lastUpdatedAt: data.lastUpdatedAt };
  }
  private clear(connection: ChannelModel): void { if (this.connection !== connection) return; this.connection = null; this.channel = null; const retry = setTimeout(() => void this.connect(), 1_000); retry.unref(); }
  private object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
  private uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
  private date(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
  private nonnegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
  private positiveInteger(value: unknown): value is number { return this.nonnegativeInteger(value) && value > 0; }
  private money(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000_000; }
}
