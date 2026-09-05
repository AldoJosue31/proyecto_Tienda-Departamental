import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { CRM_RUNTIME_CONFIG } from "../auth/token.service";
import type { CrmRuntimeConfig } from "../config/environment";
import { CrmService } from "./crm.service";
import type { CancelledOrderEvent, CompletedOrderEvent, CrmEvent, PurchaseItemSnapshot } from "./crm.types";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const QUEUE = "crm.order-projections.v1";
const DLQ = QUEUE + ".dlq";
const ROUTING_KEYS = ["order.completed.v1", "order.cancelled.v1"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CrmConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmConsumer.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  constructor(private readonly crm: CrmService, @Inject(CRM_RUNTIME_CONFIG) private readonly config: Pick<CrmRuntimeConfig, "environment" | "rabbitmqUrl">) {}
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
    } catch { this.logger.warn("CRM event consumer is reconnecting after RabbitMQ becomes available."); const retry = setTimeout(() => void this.connect(), 1_000); retry.unref(); }
  }
  private async consume(channel: Channel, message: ConsumeMessage | null): Promise<void> { if (!message) return; try { await this.crm.project(this.event(JSON.parse(message.content.toString("utf8")) as unknown)); channel.ack(message); } catch (error) { const reason = error instanceof Error ? error.message : "unknown error"; this.logger.warn("An invalid CRM event was sent to the DLQ: " + reason); channel.nack(message, false, false); } }
  private event(value: unknown): CrmEvent {
    if (!this.object(value) || !this.uuid(value.eventId) || !this.date(value.occurredAt) || (typeof value.correlationId !== "string" && value.correlationId !== null) || !this.object(value.data)) throw new Error("Invalid event envelope.");
    if (value.eventType === "order.completed.v1" && value.producer === "orders-service") return this.completed(value, value.data);
    if (value.eventType === "order.cancelled.v1" && value.producer === "orders-service") return this.cancelled(value, value.data);
    throw new Error("Unexpected CRM event type.");
  }
  private completed(value: Record<string, unknown>, data: Record<string, unknown>): CompletedOrderEvent { if (!this.uuid(data.orderId) || !this.uuid(data.customerId) || !this.uuid(data.branchId) || typeof data.currency !== "string" || !/^[A-Z]{3}$/.test(data.currency) || !this.money(data.total) || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 100) throw new Error("Invalid completed order event."); return { eventId: value.eventId as string, eventType: "order.completed.v1", occurredAt: value.occurredAt as string, correlationId: value.correlationId as string | null, orderId: data.orderId, customerId: data.customerId, branchId: data.branchId, currency: data.currency, total: data.total, items: data.items.map((item) => this.item(item)) }; }
  private cancelled(value: Record<string, unknown>, data: Record<string, unknown>): CancelledOrderEvent { if (!this.uuid(data.orderId)) throw new Error("Invalid cancelled order event."); return { eventId: value.eventId as string, eventType: "order.cancelled.v1", occurredAt: value.occurredAt as string, correlationId: value.correlationId as string | null, orderId: data.orderId }; }
  private item(value: unknown): PurchaseItemSnapshot { if (!this.object(value) || !this.uuid(value.productId) || !this.uuid(value.variantId) || typeof value.productName !== "string" || !value.productName.trim() || typeof value.sku !== "string" || !value.sku.trim() || typeof value.variantLabel !== "string" || !value.variantLabel.trim() || !this.positiveInteger(value.quantity) || !this.money(value.lineTotal)) throw new Error("Invalid completed CRM order item."); return { productId: value.productId, variantId: value.variantId, productName: value.productName.trim(), sku: value.sku.trim(), variantLabel: value.variantLabel.trim(), quantity: value.quantity, lineTotal: value.lineTotal }; }
  private clear(connection: ChannelModel): void { if (this.connection !== connection) return; this.connection = null; this.channel = null; const retry = setTimeout(() => void this.connect(), 1_000); retry.unref(); }
  private object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
  private uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
  private date(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
  private positiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
  private money(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000_000; }
}
