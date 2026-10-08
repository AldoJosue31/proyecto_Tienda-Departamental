import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { createHmac, randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";

import { CRM_RUNTIME_CONFIG } from "../auth/token.service";
import type { CrmRuntimeConfig } from "../config/environment";
import { DatabaseService } from "../database/database.service";

const EVENTS_EXCHANGE = "departamental.events";
const DEAD_LETTER_EXCHANGE = "departamental.events.dlx";
const BATCH_SIZE = 50;

interface OutboxRow extends QueryResultRow {
  id: string;
  event_type: string;
  occurred_at: Date | string;
  correlation_id: string | null;
  payload: Record<string, unknown>;
  campaign_id: string;
  customer_id: string;
}

@Injectable()
export class CampaignOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignOutboxService.name);
  private readonly workerId = "crm-campaigns-" + randomUUID();
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(
    private readonly database: DatabaseService,
    @Inject(CRM_RUNTIME_CONFIG) private readonly config: Pick<CrmRuntimeConfig, "environment" | "rabbitmqUrl" | "outboxPublishIntervalMilliseconds">,
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

  private async flush(): Promise<void> {
    if (this.flushing || this.config.environment === "test") return;
    this.flushing = true;
    try {
      for (const event of await this.claimPending()) {
        try {
          if (await this.eligible(event) && await this.issueRight(event)) await this.publish(event);
          await this.markPublished(event.id);
        } catch {
          await this.reschedule(event.id);
          this.logger.warn("A CRM campaign event will be retried.");
        }
      }
    } catch {
      this.logger.warn("CRM campaign outbox will retry after the database recovers.");
    } finally {
      this.flushing = false;
    }
  }

  private async claimPending(): Promise<OutboxRow[]> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<OutboxRow>([
        "WITH candidates AS (",
        "SELECT id FROM crm_campaign_outbox_events WHERE published_at IS NULL AND available_at <= NOW()",
        "AND (locked_until IS NULL OR locked_until < NOW()) ORDER BY occurred_at ASC, id ASC",
        "LIMIT $1 FOR UPDATE SKIP LOCKED",
        ") UPDATE crm_campaign_outbox_events AS event",
        "SET delivery_attempts = event.delivery_attempts + 1, locked_by = $2, locked_until = NOW() + INTERVAL '30 seconds'",
        "FROM candidates WHERE event.id = candidates.id",
        "RETURNING event.id, event.event_type, event.occurred_at, event.correlation_id, event.payload, event.campaign_id, event.customer_id",
      ].join("\n"), [BATCH_SIZE, this.workerId]);
      return result.rows;
    });
  }

  private async eligible(event: OutboxRow): Promise<boolean> {
    return this.database.withTransaction(async (client) => {
      const eligibility = await client.query<{ eligible: boolean }>([
        "SELECT c.last_purchase_at < COALESCE(p.cutoff_at, ((p.created_at AT TIME ZONE 'America/Mexico_City') - make_interval(months => p.segment_months)) AT TIME ZONE 'America/Mexico_City') AND p.valid_until > NOW() AS eligible",
        "FROM crm_customers c JOIN crm_campaigns p ON p.id = $1 WHERE c.customer_id = $2 FOR UPDATE OF c",
      ].join("\n"), [event.campaign_id, event.customer_id]);
      if (eligibility.rows[0]?.eligible) return true;
      await client.query("UPDATE crm_campaign_recipients SET status = 'UNDELIVERABLE', failure_code = 'NO_LONGER_ELIGIBLE' WHERE campaign_id = $1 AND customer_id = $2 AND status = 'PENDING'", [event.campaign_id, event.customer_id]);
      return false;
    });
  }

  private async issueRight(event: OutboxRow): Promise<boolean> {
    const coupon = event.payload.coupon as Record<string,unknown> | undefined;
    if (!coupon?.discountType || !coupon.discountValue || !coupon.targetScope) {
      await this.database.query("UPDATE crm_campaign_recipients SET status='UNDELIVERABLE',failure_code='LEGACY_COUPON_DEFINITION' WHERE campaign_id=$1 AND customer_id=$2 AND status='PENDING'",[event.campaign_id,event.customer_id]);
      return false;
    }
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error("Coupon service configuration required.");
    const response = await fetch(new URL("/internal/coupons/issue",process.env.PRICING_SERVICE_URL || "http://servicio-precios:3004"),{method:"POST",headers:{"Content-Type":"application/json","x-internal-service-key":createHmac("sha256",secret).update("departamental:coupons:crm:v1").digest("base64url")},body:JSON.stringify({campaignId:event.campaign_id,customerId:event.customer_id,code:coupon.code,validUntil:coupon.validUntil,discountType:coupon.discountType,discountValue:coupon.discountValue,targetScope:coupon.targetScope,targetId:coupon.targetId}),signal:AbortSignal.timeout(5000)});
    if (!response.ok) {
      if (response.status === 409 || response.status === 422) { await this.database.query("UPDATE crm_campaign_recipients SET status='UNDELIVERABLE',failure_code='COUPON_NOT_ISSUED' WHERE campaign_id=$1 AND customer_id=$2 AND status='PENDING'",[event.campaign_id,event.customer_id]); return false; }
      throw new Error("Pricing will retry coupon issuance.");
    }
    return true;
  }

  private async publish(event: OutboxRow): Promise<void> {
    const channel = await this.ensureChannel();
    channel.publish(EVENTS_EXCHANGE, event.event_type, Buffer.from(JSON.stringify({ eventId: event.id, eventType: event.event_type, occurredAt: this.iso(event.occurred_at), correlationId: event.correlation_id, producer: "crm-service", data: event.payload })), {
      contentType: "application/json", deliveryMode: 2, messageId: event.id, type: event.event_type, timestamp: Math.floor(Date.now() / 1_000),
    });
    await channel.waitForConfirms();
  }

  private async ensureChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    const connection = await connect(this.config.rabbitmqUrl);
    connection.on("error", () => this.clear(connection));
    connection.on("close", () => this.clear(connection));
    const channel = await connection.createConfirmChannel();
    channel.on("error", () => this.clear(connection));
    channel.on("close", () => this.clear(connection));
    await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true });
    this.connection = connection;
    this.channel = channel;
    return channel;
  }

  private clear(connection: ChannelModel): void { if (this.connection === connection) { this.connection = null; this.channel = null; } }
  private markPublished(eventId: string): Promise<unknown> { return this.database.query("UPDATE crm_campaign_outbox_events SET published_at = NOW(), locked_by = NULL, locked_until = NULL, last_error = NULL WHERE id = $1 AND locked_by = $2 AND published_at IS NULL", [eventId, this.workerId]); }
  private reschedule(eventId: string): Promise<unknown> { return this.database.query("UPDATE crm_campaign_outbox_events SET available_at = NOW() + make_interval(secs => LEAST(60, (2 ^ LEAST(delivery_attempts, 6))::integer)), locked_by = NULL, locked_until = NULL, last_error = 'RabbitMQ publish failed' WHERE id = $1 AND locked_by = $2 AND published_at IS NULL", [eventId, this.workerId]); }
  private iso(value: Date | string): string { return new Date(value).toISOString(); }
}
