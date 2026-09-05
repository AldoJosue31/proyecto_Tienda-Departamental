import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";
import { AuthContactClient } from "./auth-contact.client";
import { EmailProvider } from "./email.provider";
import { NOTIFICATION_RUNTIME_CONFIG } from "./notification.config";
import type { CouponEmailRequestedEvent, DeliveryStatus, NotificationFailureCode } from "./notification.types";
import type { NotificationRuntimeConfig } from "../config/environment";
import { Inject } from "@nestjs/common";

interface DeliveryRow extends QueryResultRow {
  id: string; campaign_id: string; customer_id: string; coupon_code: string; coupon_valid_until: Date | string; correlation_id: string | null;
  email: string | null; status: DeliveryStatus; attempts: number | string; next_retry_at: Date | string | null; locked_until: Date | string | null;
}
interface DeliveryIdRow extends QueryResultRow { id: string; }
interface RetryRow extends QueryResultRow { id: string; }
interface DeliveryRecord { id: string; campaignId: string; customerId: string; couponCode: string; validUntil: string; correlationId: string | null; email: string | null; attempts: number; }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class NotificationDeliveryService implements OnModuleInit, OnModuleDestroy {
  private retryTimer: NodeJS.Timeout | null = null;
  constructor(
    private readonly database: DatabaseService,
    private readonly contacts: AuthContactClient,
    private readonly email: EmailProvider,
    @Inject(NOTIFICATION_RUNTIME_CONFIG) private readonly config: Pick<NotificationRuntimeConfig, "environment" | "retryIntervalSeconds" | "retryLimit">,
  ) {}

  onModuleInit(): void {
    if (this.config.environment === "test") return;
    this.retryTimer = setInterval(() => void this.retryDue(), this.config.retryIntervalSeconds * 1_000);
    this.retryTimer.unref();
    void this.retryDue();
  }

  onModuleDestroy(): void { if (this.retryTimer) clearInterval(this.retryTimer); }

  async receive(event: CouponEmailRequestedEvent): Promise<void> {
    const deliveryId = await this.database.withTransaction(async (client) => {
      const received = await client.query<{ event_id: string }>("INSERT INTO notification_received_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id", [event.eventId, event.eventType]);
      if (!received.rows[0]) return null;
      const created = await client.query<DeliveryIdRow>([
        "INSERT INTO notification_deliveries (campaign_id, customer_id, coupon_code, coupon_valid_until, correlation_id)",
        "VALUES ($1, $2, $3, $4, $5)",
        "ON CONFLICT (campaign_id, customer_id) DO UPDATE SET updated_at = NOW()",
        "RETURNING id",
      ].join("\n"), [event.campaignId, event.customerId, event.couponCode, event.validUntil, event.correlationId]);
      return created.rows[0]?.id ?? null;
    });
    if (deliveryId) await this.deliver(deliveryId);
  }

  private async retryDue(): Promise<void> {
    const due = await this.database.query<RetryRow>([
      "SELECT id FROM notification_deliveries",
      "WHERE status = 'PENDING'",
      "OR (status = 'FAILED' AND next_retry_at <= NOW() AND attempts < $1)",
      "OR (status = 'PROCESSING' AND locked_until < NOW())",
      "ORDER BY next_retry_at ASC NULLS LAST, updated_at ASC LIMIT 25",
    ].join("\n"), [this.config.retryLimit]);
    for (const row of due.rows) await this.deliver(row.id);
  }

  private async deliver(deliveryId: string): Promise<void> {
    const record = await this.claim(deliveryId);
    if (!record) return;
    let email = record.email;
    try {
      if (!email) {
        const contact = await this.contacts.findContact(record.customerId, record.correlationId);
        if (!contact || !EMAIL.test(contact.email)) { await this.finish(record, "UNDELIVERABLE"); return; }
        email = contact.email.trim().toLowerCase();
        await this.database.query("UPDATE notification_deliveries SET email = $2 WHERE id = $1", [record.id, email]);
      }
      const providerMessageId = await this.email.send({ customerId: record.customerId, email, campaignId: record.campaignId, couponCode: record.couponCode, validUntil: record.validUntil, notificationId: record.id });
      await this.finish(record, "SENT", providerMessageId);
    } catch {
      await this.finish(record, "FAILED");
    }
  }

  private async claim(deliveryId: string): Promise<DeliveryRecord | null> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<DeliveryRow>([
        "SELECT id, campaign_id, customer_id, coupon_code, coupon_valid_until, correlation_id, email, status, attempts, next_retry_at, locked_until",
        "FROM notification_deliveries WHERE id = $1 FOR UPDATE",
      ].join("\n"), [deliveryId]);
      const current = result.rows[0];
      if (!current || current.status === "SENT" || current.status === "UNDELIVERABLE") return null;
      const lockedUntil = current.locked_until ? new Date(current.locked_until).getTime() : 0;
      if (current.status === "PROCESSING" && lockedUntil > Date.now()) return null;
      if (current.status === "FAILED" && current.next_retry_at && new Date(current.next_retry_at).getTime() > Date.now()) return null;
      const claimed = await client.query<DeliveryRow>([
        "UPDATE notification_deliveries SET status = 'PROCESSING', attempts = attempts + 1, next_retry_at = NULL, locked_until = NOW() + INTERVAL '30 seconds'",
        "WHERE id = $1",
        "RETURNING id, campaign_id, customer_id, coupon_code, coupon_valid_until, correlation_id, email, status, attempts, next_retry_at, locked_until",
      ].join("\n"), [deliveryId]);
      const row = claimed.rows[0];
      return row ? this.record(row) : null;
    });
  }

  private async finish(record: DeliveryRecord, outcome: "SENT" | "FAILED" | "UNDELIVERABLE", providerMessageId: string | null = null): Promise<void> {
    await this.database.withTransaction(async (client) => {
      const current = await client.query<DeliveryRow>("SELECT id, campaign_id, customer_id, coupon_code, coupon_valid_until, correlation_id, email, status, attempts, next_retry_at, locked_until FROM notification_deliveries WHERE id = $1 FOR UPDATE", [record.id]);
      const delivery = current.rows[0];
      if (!delivery || delivery.status === "SENT" || delivery.status === "UNDELIVERABLE") return;
      const attempts = this.number(delivery.attempts);
      const failureCode: NotificationFailureCode | null = outcome === "UNDELIVERABLE" ? "UNDELIVERABLE" : outcome === "FAILED" ? "DELIVERY_FAILED" : null;
      const nextRetry = outcome === "FAILED" && attempts < this.config.retryLimit ? new Date(Date.now() + this.config.retryIntervalSeconds * 1_000) : null;
      const status = outcome;
      await client.query([
        "UPDATE notification_deliveries",
        "SET status = $2, provider_message_id = COALESCE($3, provider_message_id), failure_code = $4, next_retry_at = $5, locked_until = NULL",
        "WHERE id = $1",
      ].join("\n"), [record.id, status, providerMessageId, failureCode, nextRetry]);
      const eventType = outcome === "SENT" ? "notification.sent.v1" : "notification.failed.v1";
      const payload = JSON.stringify({ notificationId: record.id, campaignId: record.campaignId, customerId: record.customerId, ...(failureCode ? { failureCode } : {}) });
      await client.query([
        "INSERT INTO notification_outbox_events (notification_id, event_type, correlation_id, payload)",
        "VALUES ($1, $2, $3, $4::jsonb)",
        "ON CONFLICT (notification_id, event_type) DO NOTHING",
      ].join("\n"), [record.id, eventType, record.correlationId, payload]);
    });
  }

  private record(row: DeliveryRow): DeliveryRecord { return { id: row.id, campaignId: row.campaign_id, customerId: row.customer_id, couponCode: row.coupon_code, validUntil: new Date(row.coupon_valid_until).toISOString(), correlationId: row.correlation_id, email: row.email, attempts: this.number(row.attempts) }; }
  private number(value: string | number): number { const result = Number(value); return Number.isFinite(result) ? result : 0; }
}
