import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { NotificationRuntimeConfig } from "../config/environment";
import { DatabaseService } from "../database/database.service";
import { NOTIFICATION_RUNTIME_CONFIG } from "./notification.config";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const BATCH_SIZE = 50;
interface OutboxRow extends QueryResultRow { id: string; event_type: string; occurred_at: Date | string; correlation_id: string | null; payload: Record<string, unknown>; }

@Injectable()
export class NotificationOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationOutboxService.name);
  private readonly workerId = "notification-outbox-" + randomUUID();
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  constructor(private readonly database: DatabaseService, @Inject(NOTIFICATION_RUNTIME_CONFIG) private readonly config: Pick<NotificationRuntimeConfig, "environment" | "rabbitmqUrl" | "outboxPublishIntervalMilliseconds">) {}
  onModuleInit(): void { if (this.config.environment === "test") return; this.timer = setInterval(() => void this.flush(), this.config.outboxPublishIntervalMilliseconds); this.timer.unref(); void this.flush(); }
  async onModuleDestroy(): Promise<void> { if (this.timer) clearInterval(this.timer); this.channel = null; const connection = this.connection; this.connection = null; if (connection) await connection.close().catch(() => undefined); }
  private async flush(): Promise<void> { if (this.flushing || this.config.environment === "test") return; this.flushing = true; try { for (const event of await this.claim()) { try { await this.publish(event); await this.published(event.id); } catch { await this.reschedule(event.id); this.logger.warn("A notification status event will be retried."); } } } finally { this.flushing = false; } }
  private async claim(): Promise<OutboxRow[]> { return this.database.withTransaction(async (client) => { const result = await client.query<OutboxRow>(["WITH candidates AS (SELECT id FROM notification_outbox_events WHERE published_at IS NULL AND available_at <= NOW() AND (locked_until IS NULL OR locked_until < NOW()) ORDER BY occurred_at ASC, id ASC LIMIT $1 FOR UPDATE SKIP LOCKED)", "UPDATE notification_outbox_events AS event SET delivery_attempts = event.delivery_attempts + 1, locked_by = $2, locked_until = NOW() + INTERVAL '30 seconds' FROM candidates WHERE event.id = candidates.id", "RETURNING event.id, event.event_type, event.occurred_at, event.correlation_id, event.payload"].join("\n"), [BATCH_SIZE, this.workerId]); return result.rows; }); }
  private async publish(event: OutboxRow): Promise<void> { const channel = await this.ensureChannel(); channel.publish(EVENTS_EXCHANGE, event.event_type, Buffer.from(JSON.stringify({ eventId: event.id, eventType: event.event_type, occurredAt: new Date(event.occurred_at).toISOString(), correlationId: event.correlation_id, producer: "notification-service", data: event.payload })), { contentType: "application/json", deliveryMode: 2, messageId: event.id, type: event.event_type, timestamp: Math.floor(Date.now() / 1_000) }); await channel.waitForConfirms(); }
  private async ensureChannel(): Promise<ConfirmChannel> { if (this.channel) return this.channel; const connection = await connect(this.config.rabbitmqUrl); connection.on("error", () => this.clear(connection)); connection.on("close", () => this.clear(connection)); const channel = await connection.createConfirmChannel(); channel.on("error", () => this.clear(connection)); channel.on("close", () => this.clear(connection)); await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true }); await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true }); this.connection = connection; this.channel = channel; return channel; }
  private clear(connection: ChannelModel): void { if (this.connection === connection) { this.connection = null; this.channel = null; } }
  private published(eventId: string): Promise<unknown> { return this.database.query("UPDATE notification_outbox_events SET published_at = NOW(), locked_by = NULL, locked_until = NULL, last_error = NULL WHERE id = $1 AND locked_by = $2 AND published_at IS NULL", [eventId, this.workerId]); }
  private reschedule(eventId: string): Promise<unknown> { return this.database.query("UPDATE notification_outbox_events SET available_at = NOW() + make_interval(secs => LEAST(60, (2 ^ LEAST(delivery_attempts, 6))::integer)), locked_by = NULL, locked_until = NULL, last_error = 'RabbitMQ publish failed' WHERE id = $1 AND locked_by = $2 AND published_at IS NULL", [eventId, this.workerId]); }
}
