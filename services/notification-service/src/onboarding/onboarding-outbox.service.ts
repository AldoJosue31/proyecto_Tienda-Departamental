import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { NotificationRuntimeConfig } from "../config/environment";
import { DatabaseService } from "../database/database.service";
import { NOTIFICATION_RUNTIME_CONFIG } from "../notifications/notification.config";

const EVENTS_EXCHANGE = "departamental.events";
interface OutboxRow extends QueryResultRow { id: string; event_type: string; occurred_at: Date | string; correlation_id: string | null; payload: Record<string, unknown>; }

@Injectable()
export class OnboardingOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnboardingOutboxService.name);
  private readonly workerId = "onboarding-outbox-" + randomUUID();
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  private stopped = false;
  constructor(private readonly database: DatabaseService, @Inject(NOTIFICATION_RUNTIME_CONFIG) private readonly config: Pick<NotificationRuntimeConfig, "environment" | "rabbitmqUrl" | "outboxPublishIntervalMilliseconds">) {}

  onModuleInit(): void {
    if (this.config.environment === "test") return;
    this.timer = setInterval(() => void this.flush(), this.config.outboxPublishIntervalMilliseconds);
    this.timer.unref();
    void this.flush();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.channel = null;
    const connection = this.connection;
    this.connection = null;
    if (connection) await connection.close().catch(() => undefined);
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.stopped || this.config.environment === "test") return;
    this.flushing = true;
    try {
      for (const event of await this.claim()) {
        try { await this.publish(event); await this.published(event.id); }
        catch { await this.reschedule(event.id); this.logger.warn("An onboarding delivery result will be published after RabbitMQ recovers."); }
      }
    } catch { this.logger.warn("Onboarding result outbox will retry after storage recovers."); }
    finally { this.flushing = false; }
  }

  private async claim(): Promise<OutboxRow[]> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<OutboxRow>([
        "WITH candidates AS (SELECT id FROM notification_onboarding_outbox_events WHERE published_at IS NULL AND available_at <= NOW() AND (locked_until IS NULL OR locked_until < NOW()) ORDER BY occurred_at, id LIMIT 50 FOR UPDATE SKIP LOCKED)",
        "UPDATE notification_onboarding_outbox_events AS event SET delivery_attempts = event.delivery_attempts + 1, locked_by = $1, locked_until = NOW() + INTERVAL '30 seconds' FROM candidates WHERE event.id = candidates.id",
        "RETURNING event.id, event.event_type, event.occurred_at, event.correlation_id, event.payload",
      ].join("\n"), [this.workerId]);
      return result.rows;
    });
  }

  private async publish(event: OutboxRow): Promise<void> {
    const channel = await this.ensureChannel();
    channel.publish(EVENTS_EXCHANGE, event.event_type, Buffer.from(JSON.stringify({
      ...event.payload,
      eventId: event.id,
      eventType: event.event_type,
      occurredAt: new Date(event.occurred_at).toISOString(),
      correlationId: event.correlation_id,
    })), { contentType: "application/json", deliveryMode: 2, messageId: event.id, type: event.event_type, timestamp: Math.floor(Date.now() / 1_000) });
    await channel.waitForConfirms();
  }

  private async ensureChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    const connection = await connect(this.config.rabbitmqUrl);
    this.connection = connection;
    connection.on("error", () => this.clear(connection));
    connection.on("close", () => this.clear(connection));
    try {
      const channel = await connection.createConfirmChannel();
      channel.on("error", () => this.clear(connection));
      channel.on("close", () => this.clear(connection));
      await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
      // Provision the recipient queue before publishing so startup ordering cannot lose a result.
      await channel.assertQueue("auth.onboarding-delivery.v1", { durable: true });
      await channel.bindQueue("auth.onboarding-delivery.v1", EVENTS_EXCHANGE, "auth.email.delivery.updated.v1");
      this.channel = channel;
      return channel;
    } catch { this.clear(connection); throw new Error("RabbitMQ is unavailable."); }
  }
  private clear(connection: ChannelModel): void {
    if (this.connection === connection) { this.connection = null; this.channel = null; void connection.close().catch(() => undefined); }
  }
  private published(id: string): Promise<unknown> {
    return this.database.query("UPDATE notification_onboarding_outbox_events SET published_at = NOW(), locked_by = NULL, locked_until = NULL, last_error = NULL WHERE id = $1 AND locked_by = $2 AND published_at IS NULL", [id, this.workerId]);
  }
  private reschedule(id: string): Promise<unknown> {
    return this.database.query("UPDATE notification_onboarding_outbox_events SET available_at = NOW() + make_interval(secs => LEAST(60, (2 ^ LEAST(delivery_attempts, 6))::integer)), locked_by = NULL, locked_until = NULL, last_error = 'RabbitMQ publish failed' WHERE id = $1 AND locked_by = $2 AND published_at IS NULL", [id, this.workerId]);
  }
}
