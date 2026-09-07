import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";

import { REALTIME_RUNTIME_CONFIG } from "../auth/token.service";
import type { RealtimeRuntimeConfig } from "../config/environment";
import { RealtimeGateway } from "./realtime.gateway";
import type { CourierLocationUpdatedEvent, CourierTrackingEnvelope } from "./realtime.types";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const QUEUE = "realtime.courier-tracking.v1";
const DEAD_LETTER_QUEUE = QUEUE + ".dlq";
const MAX_REMEMBERED_EVENTS = 5_000;

@Injectable()
export class CourierTrackingConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CourierTrackingConsumer.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly processedEventIds = new Set<string>();

  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    @Inject(REALTIME_RUNTIME_CONFIG) private readonly config: Pick<RealtimeRuntimeConfig, "environment" | "rabbitmqUrl">,
  ) {}

  onModuleInit(): void {
    if (this.config.environment !== "test") void this.connect();
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
      await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, "shipment.tracking.updated.v1");
      await channel.assertQueue(QUEUE, { durable: true, arguments: { "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE } });
      await channel.bindQueue(QUEUE, EVENTS_EXCHANGE, "shipment.tracking.updated.v1");
      this.connection = connection;
      this.channel = channel;
      await channel.consume(QUEUE, (message) => this.consume(channel, message), { noAck: false });
    } catch {
      this.logger.warn("Courier tracking consumer is reconnecting after RabbitMQ becomes available.");
      const retry = setTimeout(() => void this.connect(), 1_000);
      retry.unref();
    }
  }

  private consume(channel: Channel, message: ConsumeMessage | null): void {
    if (!message) return;
    try {
      const update = this.toCourierUpdate(JSON.parse(message.content.toString("utf8")) as unknown);
      if (!this.processedEventIds.has(update.eventId)) {
        this.remember(update.eventId);
        this.realtimeGateway.broadcastCourierLocationUpdated(update);
      }
      channel.ack(message);
    } catch {
      this.logger.warn("An invalid courier tracking event was sent to the Realtime DLQ.");
      channel.nack(message, false, false);
    }
  }

  private toCourierUpdate(value: unknown): CourierLocationUpdatedEvent {
    if (!this.isEnvelope(value)) throw new Error("Invalid event envelope.");
    const data = value.data;
    const location = data.location;
    if (
      !this.isUuid(value.eventId)
      || !this.isUuid(data.shipmentId)
      || !this.isUuid(data.courierId)
      || !this.isLocation(location)
    ) throw new Error("Invalid courier tracking event data.");
    return { eventId: value.eventId, occurredAt: value.occurredAt, correlationId: value.correlationId, shipmentId: data.shipmentId, courierId: data.courierId, location };
  }

  private isEnvelope(value: unknown): value is CourierTrackingEnvelope {
    if (typeof value !== "object" || value === null) return false;
    const event = value as Record<string, unknown>;
    return event.eventType === "shipment.tracking.updated.v1" && event.producer === "logistics-service"
      && typeof event.eventId === "string" && typeof event.occurredAt === "string"
      && (typeof event.correlationId === "string" || event.correlationId === null)
      && typeof event.data === "object" && event.data !== null;
  }

  private isLocation(value: unknown): value is CourierLocationUpdatedEvent["location"] {
    if (typeof value !== "object" || value === null) return false;
    const location = value as Record<string, unknown>;
    return typeof location.latitude === "number" && Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90
      && typeof location.longitude === "number" && Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180
      && typeof location.recordedAt === "string" && !Number.isNaN(Date.parse(location.recordedAt));
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
}
