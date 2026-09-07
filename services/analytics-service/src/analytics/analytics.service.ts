import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { ApiException } from "../common/api-exception";
import { DatabaseService } from "../database/database.service";
import type {
  AnalyticsEvent, AnalyticsPeriod, AnalyticsPeriodResponse, InventoryByBranchResponse,
  SalesByBranchResponse, SalesTodayResponse, TicketAverageResponse, TopProductsResponse,
} from "./analytics.types";

interface UpdatedRow extends QueryResultRow { last_updated_at: Date | string | null; }
interface SalesRow extends QueryResultRow { branch_id: string; branch_name: string; sales: string | number; completed_orders: string | number; }
interface SummaryRow extends QueryResultRow { sales: string | number; completed_orders: string | number; }
interface ProductRow extends QueryResultRow { product_id: string; variant_id: string; product_name: string; units_sold: string | number; sales: string | number; }
interface InventoryRow extends QueryResultRow { branch_id: string; branch_name: string; on_hand: string | number; reserved: string | number; available: string | number; }

const DEFAULT_CURRENCY = "MXN";
const PERIOD_DAYS: Record<AnalyticsPeriod, number> = { today: 0, "7d": 6, "30d": 29 };

@Injectable()
export class AnalyticsService {
  constructor(private readonly database: DatabaseService) {}

  async project(event: AnalyticsEvent): Promise<void> {
    await this.database.withTransaction(async (client) => {
      const claimed = await client.query<{ event_id: string }>(
        "INSERT INTO analytics_processed_events (event_id, event_type, occurred_at, correlation_id) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
        [event.eventId, event.eventType, event.occurredAt, event.correlationId],
      );
      if (!claimed.rows[0]) return;
      switch (event.eventType) {
        case "order.completed.v1": await this.projectCompletedOrder(client, event); break;
        case "order.cancelled.v1": await this.projectCancelledOrder(client, event); break;
        case "inventory.stock.changed.v1": await this.projectStock(client, event); break;
      }
    });
  }

  async salesByBranch(periodValue?: string, currencyValue?: string): Promise<SalesByBranchResponse> {
    const period = this.period(periodValue); const currency = this.currency(currencyValue); const days = PERIOD_DAYS[period];
    const result = await this.database.query<SalesRow>([
      "WITH report_window AS (SELECT (date_trunc('day', NOW() AT TIME ZONE $2) - make_interval(days => $3)) AT TIME ZONE $2 AS starts_at, (date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2 AS ends_at)",
      "SELECT b.branch_id, b.branch_name, COALESCE(SUM(o.total), 0) AS sales, COUNT(o.order_id) AS completed_orders",
      "FROM analytics_branches AS b CROSS JOIN report_window AS w",
      "LEFT JOIN analytics_order_projection AS o ON o.branch_id = b.branch_id AND o.status = 'COMPLETED' AND o.currency = $1 AND o.completed_at >= w.starts_at AND o.completed_at < w.ends_at",
      "GROUP BY b.branch_id, b.branch_name ORDER BY sales DESC, b.branch_name ASC",
    ].join("\n"), [currency, this.timezone(), days]);
    return { period: this.periodResponse(period), currency, branches: result.rows.map((row) => ({ branchId: row.branch_id, branchName: row.branch_name, sales: this.number(row.sales), completedOrders: this.number(row.completed_orders) })), lastUpdatedAt: await this.lastUpdatedAt() };
  }

  async salesToday(currencyValue?: string): Promise<SalesTodayResponse> {
    const summary = await this.salesSummary("today", this.currency(currencyValue));
    return { period: this.periodResponse("today"), currency: summary.currency, sales: summary.sales, completedOrders: summary.completedOrders, lastUpdatedAt: await this.lastUpdatedAt() };
  }

  async ticketAverage(periodValue?: string, currencyValue?: string): Promise<TicketAverageResponse> {
    const period = this.period(periodValue); const summary = await this.salesSummary(period, this.currency(currencyValue));
    return { period: this.periodResponse(period), currency: summary.currency, ticketAverage: summary.completedOrders === 0 ? 0 : this.money(summary.sales / summary.completedOrders), completedOrders: summary.completedOrders, formula: "ventas completadas / tickets completados", lastUpdatedAt: await this.lastUpdatedAt() };
  }

  async topProducts(periodValue?: string, limitValue?: string, currencyValue?: string): Promise<TopProductsResponse> {
    const period = this.period(periodValue); const limit = this.limit(limitValue); const currency = this.currency(currencyValue); const days = PERIOD_DAYS[period];
    const result = await this.database.query<ProductRow>([
      "WITH report_window AS (SELECT (date_trunc('day', NOW() AT TIME ZONE $2) - make_interval(days => $3)) AT TIME ZONE $2 AS starts_at, (date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2 AS ends_at)",
      "SELECT i.product_id, i.variant_id, i.product_name, SUM(i.quantity) AS units_sold, SUM(i.line_total) AS sales",
      "FROM analytics_order_item_projection AS i JOIN analytics_order_projection AS o ON o.order_id = i.order_id CROSS JOIN report_window AS w",
      "WHERE o.status = 'COMPLETED' AND o.currency = $1 AND o.completed_at >= w.starts_at AND o.completed_at < w.ends_at",
      "GROUP BY i.product_id, i.variant_id, i.product_name ORDER BY units_sold DESC, sales DESC, i.product_name ASC LIMIT $4",
    ].join("\n"), [currency, this.timezone(), days, limit]);
    return { period: this.periodResponse(period), currency, limit, products: result.rows.map((row) => ({ productId: row.product_id, variantId: row.variant_id, productName: row.product_name, unitsSold: this.number(row.units_sold), sales: this.number(row.sales) })), lastUpdatedAt: await this.lastUpdatedAt() };
  }

  async inventoryByBranch(): Promise<InventoryByBranchResponse> {
    const result = await this.database.query<InventoryRow>([
      "SELECT b.branch_id, b.branch_name, COALESCE(SUM(i.on_hand), 0) AS on_hand, COALESCE(SUM(i.reserved), 0) AS reserved, COALESCE(SUM(i.available), 0) AS available",
      "FROM analytics_branches AS b LEFT JOIN analytics_inventory_projection AS i ON i.branch_id = b.branch_id",
      "GROUP BY b.branch_id, b.branch_name ORDER BY available DESC, b.branch_name ASC",
    ].join("\n"));
    return { branches: result.rows.map((row) => ({ branchId: row.branch_id, branchName: row.branch_name, onHand: this.number(row.on_hand), reserved: this.number(row.reserved), available: this.number(row.available) })), lastUpdatedAt: await this.lastUpdatedAt() };
  }

  private async projectCompletedOrder(client: PoolClient, event: Extract<AnalyticsEvent, { eventType: "order.completed.v1" }>): Promise<void> {
    await this.upsertBranch(client, event.branchId);
    const cancelled = await client.query<{ order_id: string }>("SELECT order_id FROM analytics_cancelled_orders WHERE order_id = $1", [event.orderId]);
    if (cancelled.rows[0]) return;
    const inserted = await client.query<{ order_id: string }>([
      "INSERT INTO analytics_order_projection (order_id, branch_id, currency, total, completed_at, status)",
      "VALUES ($1, $2, $3, $4, $5, 'COMPLETED') ON CONFLICT (order_id) DO NOTHING RETURNING order_id",
    ].join("\n"), [event.orderId, event.branchId, event.currency, event.total, event.occurredAt]);
    if (!inserted.rows[0]) return;
    for (const item of event.items) {
      await client.query([
        "INSERT INTO analytics_order_item_projection (order_id, product_id, variant_id, product_name, quantity, line_total)",
        "VALUES ($1, $2, $3, $4, $5, $6)",
      ].join("\n"), [event.orderId, item.productId, item.variantId, item.productName, item.quantity, item.lineTotal]);
    }
  }

  private async projectCancelledOrder(client: PoolClient, event: Extract<AnalyticsEvent, { eventType: "order.cancelled.v1" }>): Promise<void> {
    await client.query("INSERT INTO analytics_cancelled_orders (order_id, cancelled_at) VALUES ($1, $2) ON CONFLICT (order_id) DO NOTHING", [event.orderId, event.occurredAt]);
    await client.query("UPDATE analytics_order_projection SET status = 'CANCELLED', cancelled_at = $2 WHERE order_id = $1", [event.orderId, event.occurredAt]);
  }

  private async projectStock(client: PoolClient, event: Extract<AnalyticsEvent, { eventType: "inventory.stock.changed.v1" }>): Promise<void> {
    await this.upsertBranch(client, event.branchId, event.branchName);
    await client.query([
      "INSERT INTO analytics_inventory_projection (variant_id, branch_id, on_hand, reserved, available, last_updated_at)",
      "VALUES ($1, $2, $3, $4, $5, $6)",
      "ON CONFLICT (variant_id, branch_id) DO UPDATE SET on_hand = EXCLUDED.on_hand, reserved = EXCLUDED.reserved, available = EXCLUDED.available, last_updated_at = EXCLUDED.last_updated_at",
      "WHERE analytics_inventory_projection.last_updated_at <= EXCLUDED.last_updated_at",
    ].join("\n"), [event.variantId, event.branchId, event.onHand, event.reserved, event.available, event.lastUpdatedAt]);
  }

  private async upsertBranch(client: PoolClient, branchId: string, name?: string): Promise<void> {
    const label = name?.trim() || "Sucursal " + branchId.slice(0, 8);
    await client.query("INSERT INTO analytics_branches (branch_id, branch_name) VALUES ($1, $2) ON CONFLICT (branch_id) DO UPDATE SET branch_name = EXCLUDED.branch_name WHERE analytics_branches.branch_name LIKE 'Sucursal %' AND EXCLUDED.branch_name NOT LIKE 'Sucursal %'", [branchId, label]);
  }

  private async salesSummary(period: AnalyticsPeriod, currency: string): Promise<{ currency: string; sales: number; completedOrders: number }> {
    const result = await this.database.query<SummaryRow>([
      "WITH report_window AS (SELECT (date_trunc('day', NOW() AT TIME ZONE $2) - make_interval(days => $3)) AT TIME ZONE $2 AS starts_at, (date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2 AS ends_at)",
      "SELECT COALESCE(SUM(o.total), 0) AS sales, COUNT(o.order_id) AS completed_orders FROM analytics_order_projection AS o CROSS JOIN report_window AS w",
      "WHERE o.status = 'COMPLETED' AND o.currency = $1 AND o.completed_at >= w.starts_at AND o.completed_at < w.ends_at",
    ].join("\n"), [currency, this.timezone(), PERIOD_DAYS[period]]);
    const row = result.rows[0];
    return { currency, sales: this.number(row?.sales ?? 0), completedOrders: this.number(row?.completed_orders ?? 0) };
  }

  private async lastUpdatedAt(): Promise<string | null> {
    const result = await this.database.query<UpdatedRow>("SELECT MAX(projected_at) AS last_updated_at FROM analytics_processed_events");
    const value = result.rows[0]?.last_updated_at;
    return value ? new Date(value).toISOString() : null;
  }
  private period(value?: string): AnalyticsPeriod { if (!value) return "today"; if (value === "today" || value === "7d" || value === "30d") return value; throw new ApiException(400, "VALIDATION_ERROR", "El periodo debe ser today, 7d o 30d"); }
  private limit(value?: string): number { if (!value) return 5; const number = Number(value); if (![5, 10, 20].includes(number)) throw new ApiException(400, "VALIDATION_ERROR", "El límite debe ser 5, 10 o 20"); return number; }
  private currency(value?: string): string { const currency = value?.trim().toUpperCase() || DEFAULT_CURRENCY; if (!/^[A-Z]{3}$/.test(currency)) throw new ApiException(400, "VALIDATION_ERROR", "La moneda debe usar código ISO de tres letras"); return currency; }
  private timezone(): string { return process.env.ANALYTICS_TIMEZONE?.trim() || "America/Mexico_City"; }
  private periodResponse(code: AnalyticsPeriod): AnalyticsPeriodResponse { return { code, timezone: this.timezone() }; }
  private number(value: string | number): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  private money(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
}
