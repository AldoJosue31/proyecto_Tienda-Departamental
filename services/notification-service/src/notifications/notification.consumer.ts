import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import type { NotificationRuntimeConfig } from "../config/environment";
import { NOTIFICATION_RUNTIME_CONFIG } from "./notification.config";
import { NotificationDeliveryService } from "./notification-delivery.service";
import type { CouponEmailRequestedEvent } from "./notification.types";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const QUEUE = "notification.coupon-emails.v1";
const DLQ = QUEUE + ".dlq";
const ROUTING_KEY = "coupon.email.requested.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class NotificationConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationConsumer.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  constructor(private readonly deliveries: NotificationDeliveryService, @Inject(NOTIFICATION_RUNTIME_CONFIG) private readonly config: Pick<NotificationRuntimeConfig, "environment" | "rabbitmqUrl">) {}
  onModuleInit(): void { if (this.config.environment !== "test") void this.connect(); }
  async onModuleDestroy(): Promise<void> { this.channel = null; const connection = this.connection; this.connection = null; if (connection) await connection.close().catch(() => undefined); }
  private async connect(): Promise<void> { try { const connection = await connect(this.config.rabbitmqUrl); const channel = await connection.createChannel(); connection.on("error", () => this.clear(connection)); connection.on("close", () => this.clear(connection)); channel.on("error", () => this.clear(connection)); channel.on("close", () => this.clear(connection)); await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true }); await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true }); await channel.assertQueue(DLQ, { durable: true }); await channel.bindQueue(DLQ, DEAD_LETTER_EXCHANGE, ROUTING_KEY); await channel.assertQueue(QUEUE, { durable: true, arguments: { "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE } }); await channel.bindQueue(QUEUE, EVENTS_EXCHANGE, ROUTING_KEY); this.connection = connection; this.channel = channel; await channel.consume(QUEUE, (message) => void this.consume(channel, message), { noAck: false }); } catch { this.logger.warn("Notification consumer is reconnecting after RabbitMQ becomes available."); const retry = setTimeout(() => void this.connect(), 1_000); retry.unref(); } }
  private async consume(channel: Channel, message: ConsumeMessage | null): Promise<void> { if (!message) return; try { await this.deliveries.receive(this.event(JSON.parse(message.content.toString("utf8")) as unknown)); channel.ack(message); } catch (error) { const reason = error instanceof Error ? error.message : "unknown error"; this.logger.warn("An invalid coupon job was sent to the DLQ: " + reason); channel.nack(message, false, false); } }
  private event(value: unknown): CouponEmailRequestedEvent { if (!this.object(value) || value.producer !== "crm-service" || value.eventType !== ROUTING_KEY || !this.uuid(value.eventId) || !this.date(value.occurredAt) || (typeof value.correlationId !== "string" && value.correlationId !== null) || !this.object(value.data) || !this.uuid(value.data.campaignId) || !this.uuid(value.data.customerId) || !this.object(value.data.coupon) || typeof value.data.coupon.code !== "string" || !/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(value.data.coupon.code) || !this.date(value.data.coupon.validUntil)) throw new Error("Invalid coupon email event."); return { eventId: value.eventId, eventType: ROUTING_KEY, occurredAt: value.occurredAt, correlationId: value.correlationId, campaignId: value.data.campaignId, customerId: value.data.customerId, couponCode: value.data.coupon.code, validUntil: value.data.coupon.validUntil }; }
  private clear(connection: ChannelModel): void { if (this.connection !== connection) return; this.connection = null; this.channel = null; const retry = setTimeout(() => void this.connect(), 1_000); retry.unref(); }
  private object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
  private uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
  private date(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
}
