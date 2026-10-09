import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import type { NotificationRuntimeConfig } from "../config/environment";
import { NOTIFICATION_RUNTIME_CONFIG } from "../notifications/notification.config";
import { encryptedContent } from "./onboarding.crypto";
import { OnboardingDeliveryService } from "./onboarding-delivery.service";
import type { OnboardingEmailRequestedEvent } from "./onboarding.types";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const QUEUE = "notification.auth-onboarding.v1";
const ROUTING_KEYS = ["auth.email.verification.requested.v1", "auth.employee.invitation.requested.v1"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && value.length <= 40 && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)); }

export function parseOnboardingEvent(value: unknown): OnboardingEmailRequestedEvent {
  if (!object(value) || !uuid(value.eventId) || !uuid(value.challengeId) || !uuid(value.userId)
    || !timestamp(value.occurredAt) || !timestamp(value.expiresAt)
    || (value.correlationId !== null && (typeof value.correlationId !== "string" || value.correlationId.length > 128 || [...value.correlationId].some((character) => character.charCodeAt(0) < 32)))
    || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1 || Number(value.generation) > 2_147_483_647
    || !encryptedContent(value.encrypted)
    || !((value.purpose === "EMAIL_VERIFICATION" && value.eventType === ROUTING_KEYS[0])
      || (value.purpose === "EMPLOYEE_INVITATION" && value.eventType === ROUTING_KEYS[1]))) {
    throw new Error("Invalid onboarding email event.");
  }
  return {
    eventId: value.eventId,
    eventType: value.eventType,
    occurredAt: value.occurredAt,
    correlationId: value.correlationId,
    challengeId: value.challengeId,
    userId: value.userId,
    purpose: value.purpose,
    generation: Number(value.generation),
    expiresAt: value.expiresAt,
    encrypted: { iv: value.encrypted.iv, tag: value.encrypted.tag, ciphertext: value.encrypted.ciphertext },
  } as OnboardingEmailRequestedEvent;
}

@Injectable()
export class OnboardingConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnboardingConsumer.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  constructor(private readonly deliveries: OnboardingDeliveryService, @Inject(NOTIFICATION_RUNTIME_CONFIG) private readonly config: Pick<NotificationRuntimeConfig, "environment" | "rabbitmqUrl">) {}

  onModuleInit(): void { if (this.config.environment !== "test") void this.connect(); }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.channel = null;
    const connection = this.connection;
    this.connection = null;
    if (connection) await connection.close().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connection) return;
    let connection: ChannelModel | undefined;
    try {
      connection = await connect(this.config.rabbitmqUrl);
      const active = connection;
      this.connection = connection;
      connection.on("error", () => this.clear(active));
      connection.on("close", () => this.clear(active));
      const channel = await connection.createChannel();
      channel.on("error", () => this.clear(active));
      channel.on("close", () => this.clear(active));
      await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
      await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true });
      await channel.assertQueue(QUEUE + ".dlq", { durable: true, arguments: { "x-message-ttl": 86_400_000 } });
      await channel.assertQueue(QUEUE, { durable: true, arguments: { "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE } });
      for (const key of ROUTING_KEYS) {
        await channel.bindQueue(QUEUE + ".dlq", DEAD_LETTER_EXCHANGE, key);
        await channel.bindQueue(QUEUE, EVENTS_EXCHANGE, key);
      }
      await channel.prefetch(5);
      if (this.stopped) { await connection.close(); return; }
      this.channel = channel;
      await channel.consume(QUEUE, (message) => void this.consume(channel, message), { noAck: false });
    } catch {
      if (connection) { if (this.connection === connection) this.connection = null; await connection.close().catch(() => undefined); }
      this.logger.warn("Onboarding consumer will reconnect after RabbitMQ becomes available.");
      this.reconnect();
    }
  }

  private async consume(channel: Channel, message: ConsumeMessage | null): Promise<void> {
    if (!message) return;
    let event: OnboardingEmailRequestedEvent;
    try {
      if (message.content.length > 16_384) throw new Error("Invalid onboarding event size.");
      event = parseOnboardingEvent(JSON.parse(message.content.toString("utf8")) as unknown);
    } catch {
      this.logger.warn("An invalid onboarding job was sent to the DLQ.");
      this.acknowledge(channel, message, false, false);
      return;
    }
    try {
      await this.deliveries.receive(event);
      this.acknowledge(channel, message, true);
    } catch {
      // Valid jobs with unavailable storage remain recoverable; raw event content is never logged.
      this.logger.warn("An onboarding job will retry after storage recovers.");
      const timer = setTimeout(() => this.acknowledge(channel, message, false, true), 1_000);
      timer.unref();
    }
  }

  private acknowledge(channel: Channel, message: ConsumeMessage, accepted: boolean, requeue = false): void {
    try { if (accepted) channel.ack(message); else channel.nack(message, false, requeue); }
    catch { /* A closed channel causes RabbitMQ to return unacknowledged jobs to the durable queue. */ }
  }
  private clear(connection: ChannelModel): void {
    if (this.connection !== connection) return;
    this.connection = null;
    this.channel = null;
    void connection.close().catch(() => undefined);
    this.reconnect();
  }
  private reconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; void this.connect(); }, 1_000);
    this.reconnectTimer.unref();
  }
}
