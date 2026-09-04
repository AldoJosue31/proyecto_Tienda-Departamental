import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import type { PoolClient, QueryResultRow } from "pg";
import { randomUUID } from "node:crypto";

import { PRICING_RUNTIME_CONFIG } from "../auth/token.service";
import type { PricingRuntimeConfig } from "../config/environment";
import { DatabaseService } from "../database/database.service";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const BATCH_SIZE = 25;

interface OutboxRow extends QueryResultRow {
  id: string;
  event_type: string;
  occurred_at: Date | string;
  correlation_id: string | null;
  payload: Record<string, unknown>;
}

export interface PricingDomainEvent {
  eventType: "promotion.activated.v1" | "promotion.expired.v1";
  correlationId: string | null;
  data: Record<string, unknown>;
}

@Injectable()
export class PricingOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PricingOutboxService.name);
  private readonly workerId = "pricing-" + randomUUID();
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(
    private readonly database: DatabaseService,
    @Inject(PRICING_RUNTIME_CONFIG)
    private readonly config: Pick<
      PricingRuntimeConfig,
      "environment" | "rabbitmqUrl" | "outboxPublishIntervalMilliseconds"
    >,
  ) {}

  onModuleInit(): void {
    if (this.config.environment === "test") return;
    this.timer = setInterval(() => void this.flush(), this.config.outboxPublishIntervalMilliseconds);
    this.timer.unref();
    void this.flush();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.channel = null;
    const connection = this.connection;
    this.connection = null;
    if (connection) await connection.close().catch(() => undefined);
  }

  async enqueue(client: PoolClient, event: PricingDomainEvent): Promise<void> {
    await client.query(
      "INSERT INTO pricing_outbox_events (event_type, correlation_id, payload) VALUES ($1, $2, $3::jsonb)",
      [event.eventType, event.correlationId, JSON.stringify(event.data)],
    );
  }

  async flush(): Promise<void> {
    if (this.flushing || this.config.environment === "test") return;
    this.flushing = true;
    try {
      const events = await this.claimPending();
      for (const event of events) {
        try {
          await this.publish(event);
          await this.markPublished(event.id);
        } catch {
          await this.reschedule(event.id);
          this.logger.warn("A Pricing outbox event will be retried.");
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async claimPending(): Promise<OutboxRow[]> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<OutboxRow>([
        "WITH candidates AS (",
        "  SELECT id FROM pricing_outbox_events",
        "  WHERE published_at IS NULL AND available_at <= NOW()",
        "    AND (locked_until IS NULL OR locked_until < NOW())",
        "  ORDER BY occurred_at ASC, id ASC LIMIT $1 FOR UPDATE SKIP LOCKED",
        ")",
        "UPDATE pricing_outbox_events AS event",
        "SET delivery_attempts = event.delivery_attempts + 1,",
        "  locked_by = $2, locked_until = NOW() + INTERVAL '30 seconds'",
        "FROM candidates WHERE event.id = candidates.id",
        "RETURNING event.id, event.event_type, event.occurred_at, event.correlation_id, event.payload",
      ].join("\n"), [BATCH_SIZE, this.workerId]);
      return result.rows;
    });
  }

  private async publish(event: OutboxRow): Promise<void> {
    const channel = await this.ensureChannel();
    channel.publish(
      EVENTS_EXCHANGE,
      event.event_type,
      Buffer.from(JSON.stringify({
        eventId: event.id,
        eventType: event.event_type,
        occurredAt: this.iso(event.occurred_at),
        correlationId: event.correlation_id,
        producer: "pricing-service",
        data: event.payload,
      })),
      {
        contentType: "application/json",
        deliveryMode: 2,
        messageId: event.id,
        type: event.event_type,
        timestamp: Math.floor(Date.now() / 1_000),
      },
    );
    await channel.waitForConfirms();
  }

  private async ensureChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    const connection = await connect(this.config.rabbitmqUrl);
    connection.on("error", () => this.clearConnection(connection));
    connection.on("close", () => this.clearConnection(connection));
    const channel = await connection.createConfirmChannel();
    channel.on("error", () => this.clearConnection(connection));
    channel.on("close", () => this.clearConnection(connection));
    await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true });
    this.connection = connection;
    this.channel = channel;
    return channel;
  }

  private clearConnection(connection: ChannelModel): void {
    if (this.connection === connection) {
      this.connection = null;
      this.channel = null;
    }
  }

  private async markPublished(eventId: string): Promise<void> {
    await this.database.query(
      "UPDATE pricing_outbox_events SET published_at = NOW(), locked_by = NULL, locked_until = NULL, last_error = NULL WHERE id = $1 AND locked_by = $2 AND published_at IS NULL",
      [eventId, this.workerId],
    );
  }

  private async reschedule(eventId: string): Promise<void> {
    await this.database.query(
      [
        "UPDATE pricing_outbox_events",
        "SET available_at = NOW() + make_interval(secs => LEAST(60, (2 ^ LEAST(delivery_attempts, 6))::integer)),",
        "  locked_by = NULL, locked_until = NULL, last_error = 'RabbitMQ publish failed'",
        "WHERE id = $1 AND locked_by = $2 AND published_at IS NULL",
      ].join("\n"),
      [eventId, this.workerId],
    );
  }

  private iso(value: Date | string): string {
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }
}
