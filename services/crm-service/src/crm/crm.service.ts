import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { ApiException } from "../common/api-exception";
import { DatabaseService } from "../database/database.service";
import type { CampaignResponse, CancelledOrderEvent, CompletedOrderEvent, CouponCampaign, CouponCampaignInput, CrmEvent, CustomerProfileResponse, CustomerPurchase, CustomersResponse, CustomerSummary, InactiveSegmentResponse, NotificationDeliveryEvent, PurchaseItemSnapshot } from "./crm.types";

interface CustomerRow extends QueryResultRow { customer_id: string; first_purchase_at: Date | string; last_purchase_at: Date | string; completed_orders: number | string; lifetime_total: number | string; currency: string; updated_at: Date | string; }
interface PurchaseRow extends QueryResultRow { order_id: string; branch_id: string; currency: string; total: number | string; purchased_at: Date | string; }
interface ItemRow extends QueryResultRow { order_id: string; product_id: string; variant_id: string; product_name: string; sku: string; variant_label: string; quantity: number | string; line_total: number | string; }
interface UpdatedRow extends QueryResultRow { last_updated_at: Date | string | null; }
interface CampaignRow extends QueryResultRow { id: string; created_by: string; segment_months: number | string; coupon_code: string; valid_until: Date | string; target_count: number | string; created_at: Date | string; updated_at: Date | string; }
interface CampaignCountsRow extends QueryResultRow { pending_count: number | string; sent_count: number | string; failed_count: number | string; undeliverable_count: number | string; }
interface CampaignRecipientRow extends QueryResultRow { campaign_id: string; customer_id: string; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CrmService {
  constructor(private readonly database: DatabaseService) {}

  async project(event: CrmEvent): Promise<void> {
    await this.database.withTransaction(async (client) => {
      const claimed = await client.query<{ event_id: string }>(
        "INSERT INTO crm_processed_events (event_id, event_type, occurred_at, correlation_id) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
        [event.eventId, event.eventType, event.occurredAt, event.correlationId],
      );
      if (!claimed.rows[0]) return;
      if (event.eventType === "order.completed.v1") await this.projectCompletedOrder(client, event);
      else await this.projectCancelledOrder(client, event);
    });
  }

  async customers(): Promise<CustomersResponse> {
    const result = await this.database.query<CustomerRow>(this.customerSelect("ORDER BY last_purchase_at DESC, customer_id ASC"));
    return { customers: result.rows.map((row) => this.customer(row)), lastUpdatedAt: await this.lastUpdatedAt() };
  }

  async customerProfile(customerIdValue: string): Promise<CustomerProfileResponse> {
    const customerId = this.customerId(customerIdValue);
    const result = await this.database.query<CustomerRow>(this.customerSelect("WHERE customer_id = $1"), [customerId]);
    const customer = result.rows[0];
    if (!customer) throw new ApiException(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado en la proyección CRM");
    const purchases = await this.purchases(customerId);
    return { customer: this.customer(customer), purchases, lastUpdatedAt: await this.lastUpdatedAt() };
  }

  async inactiveSegment(monthsValue?: string, now = new Date()): Promise<InactiveSegmentResponse> {
    const months = this.months(monthsValue);
    const referenceAt = new Date(now);
    const cutoffAt = new Date(referenceAt);
    cutoffAt.setUTCMonth(cutoffAt.getUTCMonth() - months);
    const result = await this.database.query<CustomerRow>(this.customerSelect("WHERE last_purchase_at < $1 ORDER BY last_purchase_at ASC, customer_id ASC LIMIT 50"), [cutoffAt]);
    const count = await this.database.query<{ count: string | number }>("SELECT COUNT(*) AS count FROM crm_customers WHERE last_purchase_at < $1", [cutoffAt]);
    return {
      segment: {
        code: "INACTIVE_PURCHASERS", months, referenceAt: referenceAt.toISOString(), cutoffAt: cutoffAt.toISOString(), includesNeverPurchased: false,
        rule: "Incluye clientes con compras proyectadas cuya última compra es anterior al corte; excluye identidades sin compras proyectadas.",
      },
      count: this.number(count.rows[0]?.count ?? 0), customers: result.rows.map((row) => this.customer(row)), lastUpdatedAt: await this.lastUpdatedAt(),
    };
  }

  async createCampaign(inputValue: CouponCampaignInput, createdBy: string, rawIdempotencyKey: string | undefined, correlationId: string | null): Promise<CampaignResponse> {
    const input = this.campaignInput(inputValue);
    const creator = this.customerId(createdBy);
    const requestKey = rawIdempotencyKey?.trim() || randomUUID();
    if (requestKey.length > 200) throw new ApiException(400, "VALIDATION_ERROR", "Idempotency-Key no puede exceder 200 caracteres");
    const cutoffAt = new Date();
    cutoffAt.setUTCMonth(cutoffAt.getUTCMonth() - input.months);
    return this.database.withTransaction(async (client) => {
      const prior = await client.query<CampaignRow>("SELECT id, created_by, segment_months, coupon_code, valid_until, target_count, created_at, updated_at FROM crm_campaigns WHERE created_by = $1 AND request_key = $2", [creator, requestKey]);
      if (prior.rows[0]) return this.campaignForClient(client, prior.rows[0].id);
      const recipients = await client.query<{ customer_id: string }>("SELECT customer_id FROM crm_customers WHERE last_purchase_at < $1 ORDER BY last_purchase_at ASC, customer_id ASC", [cutoffAt]);
      if (!recipients.rows.length) throw new ApiException(422, "EMPTY_SEGMENT", "No hay clientes elegibles para crear esta campaña");
      const created = await client.query<CampaignRow>([
        "INSERT INTO crm_campaigns (created_by, request_key, segment_months, coupon_code, valid_until, target_count)",
        "VALUES ($1, $2, $3, $4, $5, $6)",
        "RETURNING id, created_by, segment_months, coupon_code, valid_until, target_count, created_at, updated_at",
      ].join("\n"), [creator, requestKey, input.months, input.couponCode, input.validUntil, recipients.rows.length]);
      const campaign = created.rows[0];
      if (!campaign) throw new Error("Campaign creation failed.");
      for (const recipient of recipients.rows) {
        await client.query("INSERT INTO crm_campaign_recipients (campaign_id, customer_id) VALUES ($1, $2)", [campaign.id, recipient.customer_id]);
        const payload = JSON.stringify({ campaignId: campaign.id, customerId: recipient.customer_id, coupon: { code: input.couponCode, validUntil: input.validUntil.toISOString() } });
        await client.query([
          "INSERT INTO crm_campaign_outbox_events (campaign_id, customer_id, event_type, correlation_id, payload)",
          "VALUES ($1, $2, 'coupon.email.requested.v1', $3, $4::jsonb)",
        ].join("\n"), [campaign.id, recipient.customer_id, correlationId, payload]);
      }
      return this.campaignForClient(client, campaign.id);
    });
  }

  async campaign(campaignIdValue: string): Promise<CampaignResponse> {
    const campaignId = this.customerId(campaignIdValue);
    return this.database.withTransaction((client) => this.campaignForClient(client, campaignId));
  }

  async applyDeliveryStatus(event: NotificationDeliveryEvent): Promise<void> {
    await this.database.withTransaction(async (client) => {
      const claimed = await client.query<{ event_id: string }>("INSERT INTO crm_processed_events (event_id, event_type, occurred_at, correlation_id) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id", [event.eventId, event.eventType, event.occurredAt, event.correlationId]);
      if (!claimed.rows[0]) return;
      const recipient = await client.query<CampaignRecipientRow>("SELECT campaign_id, customer_id FROM crm_campaign_recipients WHERE campaign_id = $1 AND customer_id = $2 FOR UPDATE", [event.campaignId, event.customerId]);
      if (!recipient.rows[0]) throw new Error("Notification event references an unknown campaign recipient.");
      if (event.eventType === "notification.sent.v1") {
        await client.query([
          "UPDATE crm_campaign_recipients",
          "SET status = 'SENT', notification_id = $3, failure_code = NULL, sent_at = $4, attempts = GREATEST(attempts, 1)",
          "WHERE campaign_id = $1 AND customer_id = $2 AND status <> 'SENT'",
        ].join("\n"), [event.campaignId, event.customerId, event.notificationId, event.occurredAt]);
      } else {
        const status = event.failureCode === "UNDELIVERABLE" ? "UNDELIVERABLE" : "FAILED";
        await client.query([
          "UPDATE crm_campaign_recipients",
          "SET status = $3, notification_id = $4, failure_code = $5, attempts = GREATEST(attempts, 1)",
          "WHERE campaign_id = $1 AND customer_id = $2 AND status <> 'SENT'",
        ].join("\n"), [event.campaignId, event.customerId, status, event.notificationId, event.failureCode ?? "DELIVERY_FAILED"]);
      }
      await client.query("UPDATE crm_campaigns SET updated_at = NOW() WHERE id = $1", [recipient.rows[0].campaign_id]);
    });
  }

  private async projectCompletedOrder(client: PoolClient, event: CompletedOrderEvent): Promise<void> {
    const cancelled = await client.query<{ order_id: string }>("SELECT order_id FROM crm_cancelled_orders WHERE order_id = $1", [event.orderId]);
    if (cancelled.rows[0]) return;
    const inserted = await client.query<{ order_id: string }>(
      "INSERT INTO crm_purchase_projections (order_id, customer_id, branch_id, currency, total, purchased_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (order_id) DO NOTHING RETURNING order_id",
      [event.orderId, event.customerId, event.branchId, event.currency, event.total, event.occurredAt],
    );
    if (!inserted.rows[0]) return;
    for (const item of event.items) {
      await client.query(
        "INSERT INTO crm_purchase_item_snapshots (order_id, product_id, variant_id, product_name, sku, variant_label, quantity, line_total) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [event.orderId, item.productId, item.variantId, item.productName, item.sku, item.variantLabel, item.quantity, item.lineTotal],
      );
    }
    await this.recalculateCustomer(client, event.customerId);
  }

  private async projectCancelledOrder(client: PoolClient, event: CancelledOrderEvent): Promise<void> {
    await client.query("INSERT INTO crm_cancelled_orders (order_id, cancelled_at) VALUES ($1, $2) ON CONFLICT (order_id) DO NOTHING", [event.orderId, event.occurredAt]);
    const purchase = await client.query<{ customer_id: string }>("SELECT customer_id FROM crm_purchase_projections WHERE order_id = $1", [event.orderId]);
    if (!purchase.rows[0]) return;
    await client.query("UPDATE crm_purchase_projections SET status = 'CANCELLED', cancelled_at = $2 WHERE order_id = $1", [event.orderId, event.occurredAt]);
    await this.recalculateCustomer(client, purchase.rows[0].customer_id);
  }

  private async recalculateCustomer(client: PoolClient, customerId: string): Promise<void> {
    const summary = await client.query<{ first_purchase_at: Date | string | null; last_purchase_at: Date | string | null; completed_orders: string | number; lifetime_total: string | number; currency: string | null }>([
      "SELECT MIN(purchased_at) AS first_purchase_at, MAX(purchased_at) AS last_purchase_at, COUNT(*) AS completed_orders, COALESCE(SUM(total), 0) AS lifetime_total, (array_agg(currency ORDER BY purchased_at DESC))[1] AS currency",
      "FROM crm_purchase_projections WHERE customer_id = $1 AND status = 'COMPLETED'",
    ].join("\n"), [customerId]);
    const value = summary.rows[0];
    if (!value || !value.first_purchase_at || !value.last_purchase_at || !value.currency || this.number(value.completed_orders) === 0) {
      await client.query("DELETE FROM crm_customers WHERE customer_id = $1", [customerId]);
      return;
    }
    await client.query([
      "INSERT INTO crm_customers (customer_id, first_purchase_at, last_purchase_at, completed_orders, lifetime_total, currency)",
      "VALUES ($1, $2, $3, $4, $5, $6)",
      "ON CONFLICT (customer_id) DO UPDATE SET first_purchase_at = EXCLUDED.first_purchase_at, last_purchase_at = EXCLUDED.last_purchase_at, completed_orders = EXCLUDED.completed_orders, lifetime_total = EXCLUDED.lifetime_total, currency = EXCLUDED.currency",
    ].join("\n"), [customerId, value.first_purchase_at, value.last_purchase_at, this.number(value.completed_orders), this.number(value.lifetime_total), value.currency]);
  }

  private async purchases(customerId: string): Promise<CustomerPurchase[]> {
    const result = await this.database.query<PurchaseRow>("SELECT order_id, branch_id, currency, total, purchased_at FROM crm_purchase_projections WHERE customer_id = $1 AND status = 'COMPLETED' ORDER BY purchased_at DESC, order_id DESC", [customerId]);
    if (!result.rows.length) return [];
    const orderIds = result.rows.map((row) => row.order_id);
    const itemResult = await this.database.query<ItemRow>("SELECT order_id, product_id, variant_id, product_name, sku, variant_label, quantity, line_total FROM crm_purchase_item_snapshots WHERE order_id = ANY($1::uuid[]) ORDER BY created_at ASC", [orderIds]);
    const items = new Map<string, PurchaseItemSnapshot[]>();
    for (const row of itemResult.rows) {
      const current = items.get(row.order_id) ?? [];
      current.push({ productId: row.product_id, variantId: row.variant_id, productName: row.product_name, sku: row.sku, variantLabel: row.variant_label, quantity: this.number(row.quantity), lineTotal: this.number(row.line_total) });
      items.set(row.order_id, current);
    }
    return result.rows.map((row) => ({ orderId: row.order_id, branchId: row.branch_id, currency: row.currency, total: this.number(row.total), purchasedAt: this.iso(row.purchased_at), items: items.get(row.order_id) ?? [] }));
  }

  private async campaignForClient(client: Pick<PoolClient, "query">, campaignId: string): Promise<CampaignResponse> {
    const campaignResult = await client.query<CampaignRow>("SELECT id, created_by, segment_months, coupon_code, valid_until, target_count, created_at, updated_at FROM crm_campaigns WHERE id = $1", [campaignId]);
    const campaign = campaignResult.rows[0];
    if (!campaign) throw new ApiException(404, "CAMPAIGN_NOT_FOUND", "Campaña no encontrada");
    const counts = await client.query<CampaignCountsRow>([
      "SELECT COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_count,",
      "COUNT(*) FILTER (WHERE status = 'SENT') AS sent_count,",
      "COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_count,",
      "COUNT(*) FILTER (WHERE status = 'UNDELIVERABLE') AS undeliverable_count",
      "FROM crm_campaign_recipients WHERE campaign_id = $1",
    ].join("\n"), [campaignId]);
    const progress = counts.rows[0] ?? { pending_count: 0, sent_count: 0, failed_count: 0, undeliverable_count: 0 };
    const pendingCount = this.number(progress.pending_count);
    const sentCount = this.number(progress.sent_count);
    const failedCount = this.number(progress.failed_count);
    const undeliverableCount = this.number(progress.undeliverable_count);
    const status = pendingCount > 0 ? (sentCount + failedCount + undeliverableCount > 0 ? "PROCESSING" : "QUEUED") : (failedCount + undeliverableCount > 0 ? "PARTIAL" : "COMPLETED");
    const response: CouponCampaign = {
      id: campaign.id, segmentMonths: this.number(campaign.segment_months), couponCode: campaign.coupon_code, validUntil: this.iso(campaign.valid_until), targetCount: this.number(campaign.target_count), pendingCount, sentCount, failedCount, undeliverableCount, status, createdBy: campaign.created_by, createdAt: this.iso(campaign.created_at), updatedAt: this.iso(campaign.updated_at),
    };
    return { campaign: response };
  }

  private campaignInput(value: CouponCampaignInput): { months: number; couponCode: string; validUntil: Date } {
    const raw = value as Record<string, unknown>;
    const months = this.months(raw.months === undefined ? undefined : String(raw.months));
    const couponCode = typeof raw.couponCode === "string" ? raw.couponCode.trim().toUpperCase() : "";
    if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(couponCode)) throw new ApiException(400, "VALIDATION_ERROR", "couponCode debe tener entre 3 y 64 caracteres alfanuméricos, guiones o guiones bajos");
    const validUntil = typeof raw.validUntil === "string" ? new Date(raw.validUntil) : new Date("");
    if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= Date.now()) throw new ApiException(422, "VALIDATION_ERROR", "validUntil debe ser una fecha futura válida");
    return { months, couponCode, validUntil };
  }

  private customerSelect(suffix: string): string { return ["SELECT customer_id, first_purchase_at, last_purchase_at, completed_orders, lifetime_total, currency, updated_at", "FROM crm_customers", suffix].join("\n"); }
  private async lastUpdatedAt(): Promise<string | null> { const result = await this.database.query<UpdatedRow>("SELECT MAX(projected_at) AS last_updated_at FROM crm_processed_events"); const value = result.rows[0]?.last_updated_at; return value ? this.iso(value) : null; }
  private customer(row: CustomerRow): CustomerSummary { return { customerId: row.customer_id, firstPurchaseAt: this.iso(row.first_purchase_at), lastPurchaseAt: this.iso(row.last_purchase_at), completedOrders: this.number(row.completed_orders), lifetimeTotal: this.number(row.lifetime_total), currency: row.currency, updatedAt: this.iso(row.updated_at) }; }
  private customerId(value: string): string { const id = value.trim(); if (!UUID.test(id)) throw new ApiException(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado en la proyección CRM"); return id; }
  private months(value?: string): number { if (value === undefined || value === "") return 3; const months = Number(value); if (!Number.isSafeInteger(months) || months < 1 || months > 60) throw new ApiException(400, "VALIDATION_ERROR", "months debe ser un entero entre 1 y 60"); return months; }
  private number(value: string | number): number { const result = Number(value); return Number.isFinite(result) ? result : 0; }
  private iso(value: Date | string): string { return new Date(value).toISOString(); }
}
