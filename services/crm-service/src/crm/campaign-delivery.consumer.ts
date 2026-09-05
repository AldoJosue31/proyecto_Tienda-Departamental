import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";

import { CRM_RUNTIME_CONFIG } from "../auth/token.service";
import type { CrmRuntimeConfig } from "../config/environment";
import { CrmService } from "./crm.service";
import type { NotificationDeliveryEvent } from "./crm.types";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const QUEUE = "crm.campaign-delivery-status.v1";
const DLQ = QUEUE + ".dlq";
const ROUTING_KEYS = ["notification.sent.v1", "notification.failed.v1"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CampaignDeliveryConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignDeliveryConsumer.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(private readonly crm: CrmService, @Inject(CRM_RUNTIME_CONFIG) private readonly config: Pick<CrmRuntimeConfig, "environment" | "rabbitmqUrl">) {}
  onModuleInit(): void { if (this.config.environment !== "test") void this.connect(); }
  async onModuleDestroy(): Promise<void> { this.channel = null; const connection = this.connection; this.connection = null; if (connection) await connection.close().catch(() => undefined); }

  private async connect(): Promise<void> {
    try {
      const connection = await connect(this.config.rabbitmqUrl);
      const channel = await connection.createChannel();
      connection.on("error", () => this.clear(connection)); connection.on("close", () => this.clear(connection)); channel.on("error", () => this.clear(connection)); channel.on("close", () => this.clear(connection));
      await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true }); await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true });
      await channel.assertQueue(DLQ, { durable: true }); for (const key of ROUTING_KEYS) await channel.bindQueue(DLQ, DEAD_LETTER_EXCHANGE, key);
      await channel.assertQueue(QUEUE, { durable: true, arguments: { "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE } }); for (const key of ROUTING_KEYS) await channel.bindQueue(QUEUE, EVENTS_EXCHANGE, key);
      this.connection = connection; this.channel = channel; await channel.consume(QUEUE, (message) => void this.consume(channel, message), { noAck: false });
    } catch { this.logger.warn("CRM campaign delivery consumer is reconnecting after RabbitMQ becomes available."); const retry = setTimeout(() => void this.connect(), 1_000); retry.unref(); }
  }

  private async consume(channel: Channel, message: ConsumeMessage | null): Promise<void> {
    if (!message) return;
    try { await this.crm.applyDeliveryStatus(this.event(JSON.parse(message.content.toString("utf8")) as unknown)); channel.ack(message); }
    catch (error) { const reason = error instanceof Error ? error.message : "unknown error"; this.logger.warn("An invalid notification status event was sent to the DLQ: " + reason); channel.nack(message, false, false); }
  }

  private event(value: unknown): NotificationDeliveryEvent {
    if (!this.object(value) || !this.uuid(value.eventId) || !this.date(value.occurredAt) || (typeof value.correlationId !== "string" && value.correlationId !== null) || value.producer !== "notification-service" || !this.object(value.data) || !this.uuid(value.data.campaignId) || !this.uuid(value.data.customerId) || !this.uuid(value.data.notificationId)) throw new Error("Invalid notification status event.");
    if (value.eventType === "notification.sent.v1") return { eventId: value.eventId, eventType: value.eventType, occurredAt: value.occurredAt, correlationId: value.correlationId, campaignId: value.data.campaignId, customerId: value.data.customerId, notificationId: value.data.notificationId };
    if (value.eventType === "notification.failed.v1" && (value.data.failureCode === "DELIVERY_FAILED" || value.data.failureCode === "UNDELIVERABLE")) return { eventId: value.eventId, eventType: value.eventType, occurredAt: value.occurredAt, correlationId: value.correlationId, campaignId: value.data.campaignId, customerId: value.data.customerId, notificationId: value.data.notificationId, failureCode: value.data.failureCode };
    throw new Error("Unexpected notification status event type.");
  }

  private clear(connection: ChannelModel): void { if (this.connection !== connection) return; this.connection = null; this.channel = null; const retry = setTimeout(() => void this.connect(), 1_000); retry.unref(); }
  private object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
  private uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
  private date(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
}
