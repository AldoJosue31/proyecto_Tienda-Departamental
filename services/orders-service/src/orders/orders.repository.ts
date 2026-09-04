import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { DatabaseService } from "../database/database.service";
import type {
  CreateOrderSnapshot,
  IdempotencyRecord,
  OrderActor,
  OrderItem,
  OrderStatus,
  StoredOrder,
} from "./orders.types";

interface OrderRow extends QueryResultRow {
  id: string;
  customer_id: string;
  created_by: string;
  created_by_role: OrderActor["role"];
  branch_id: string;
  status: OrderStatus;
  currency: string;
  subtotal: string | number;
  discount_total: string | number;
  total: string | number;
  cancellation_reason: string | null;
  cancelled_at: Date | string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ItemRow extends QueryResultRow {
  id: string;
  product_id: string;
  category_id: string;
  variant_id: string;
  branch_id: string;
  product_name: string;
  sku: string;
  variant_label: string;
  quantity: number;
  list_unit_price: string | number;
  unit_price: string | number;
  line_discount_total: string | number;
  line_total: string | number;
  currency: string;
  reservation_id: string | null;
}

interface IdempotencyRow extends QueryResultRow {
  actor_id: string;
  idempotency_key: string;
  request_hash: string;
  order_id: string;
  outcome_code: string | null;
  outcome_message: string | null;
}

interface IdentifierRow extends QueryResultRow {
  id: string;
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly database: DatabaseService) {}

  async findIdempotency(
    client: PoolClient,
    actorId: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    const result = await client.query<IdempotencyRow>(
      [
        "SELECT actor_id, idempotency_key, request_hash, order_id, outcome_code, outcome_message",
        "FROM orders_idempotency",
        "WHERE actor_id = $1 AND idempotency_key = $2",
      ].join("\n"),
      [actorId, idempotencyKey],
    );
    const row = result.rows[0];
    return row ? this.toIdempotency(row) : null;
  }

  async createDraft(
    client: PoolClient,
    input: {
      customerId: string;
      branchId: string;
      actor: OrderActor;
      idempotencyKey: string;
      requestHash: string;
    },
  ): Promise<StoredOrder> {
    const created = await client.query<IdentifierRow>(
      [
        "INSERT INTO orders (customer_id, created_by, created_by_role, branch_id)",
        "VALUES ($1, $2, $3, $4)",
        "RETURNING id",
      ].join("\n"),
      [input.customerId, input.actor.id, input.actor.role, input.branchId],
    );
    const orderId = created.rows[0]?.id;
    if (!orderId) throw new Error("Order creation failed.");
    await client.query(
      [
        "INSERT INTO orders_idempotency (actor_id, idempotency_key, request_hash, order_id)",
        "VALUES ($1, $2, $3, $4)",
      ].join("\n"),
      [input.actor.id, input.idempotencyKey, input.requestHash, orderId],
    );
    await this.audit(client, orderId, input.actor, "ORDER_CREATED");
    const order = await this.findByIdForClient(client, orderId);
    if (!order) throw new Error("Order is missing immediately after creation.");
    return order;
  }

  async findByIdForClient(
    client: PoolClient,
    orderId: string,
    forUpdate = false,
  ): Promise<StoredOrder | null> {
    const result = await client.query<OrderRow>(
      this.orderSelect(forUpdate),
      [orderId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.toOrder(row, await this.itemsFor(client, orderId));
  }

  async findById(orderId: string): Promise<StoredOrder | null> {
    const result = await this.database.query<OrderRow>(this.orderSelect(false), [orderId]);
    const row = result.rows[0];
    if (!row) return null;
    const itemRows = await this.database.query<ItemRow>(this.itemSelect(), [orderId]);
    return this.toOrder(row, itemRows.rows.map((item) => this.toItem(item)));
  }

  async listOperations(): Promise<StoredOrder[]> {
    const rows = await this.database.query<OrderRow>(
      this.ordersListSelect(),
    );
    const orders: StoredOrder[] = [];
    for (const row of rows.rows) {
      const items = await this.database.query<ItemRow>(this.itemSelect(), [row.id]);
      orders.push(this.toOrder(row, items.rows.map((item) => this.toItem(item))));
    }
    return orders;
  }

  async replaceItems(
    client: PoolClient,
    orderId: string,
    snapshots: CreateOrderSnapshot[],
  ): Promise<void> {
    await client.query("DELETE FROM order_items WHERE order_id = $1", [orderId]);
    for (const snapshot of snapshots) {
      await client.query(
        [
          "INSERT INTO order_items (",
          "  order_id, product_id, category_id, variant_id, branch_id, product_name, sku, variant_label,",
          "  quantity, list_unit_price, unit_price, line_discount_total, line_total, currency",
          ") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
        ].join("\n"),
        [
          orderId,
          snapshot.productId,
          snapshot.categoryId,
          snapshot.variantId,
          snapshot.branchId,
          snapshot.productName,
          snapshot.sku,
          snapshot.variantLabel,
          snapshot.quantity,
          snapshot.listUnitPrice,
          snapshot.unitPrice,
          snapshot.lineDiscountTotal,
          snapshot.lineTotal,
          snapshot.currency,
        ],
      );
    }
    const subtotal = this.money(snapshots.reduce((total, item) => total + item.listUnitPrice * item.quantity, 0));
    const discount = this.money(snapshots.reduce((total, item) => total + item.lineDiscountTotal, 0));
    const total = this.money(subtotal - discount);
    const currency = snapshots[0]?.currency;
    if (!currency) throw new Error("Order requires at least one item.");
    await client.query(
      [
        "UPDATE orders",
        "SET currency = $1, subtotal = $2, discount_total = $3, total = $4, version = version + 1",
        "WHERE id = $5",
      ].join("\n"),
      [currency, subtotal, discount, total, orderId],
    );
  }

  async assignReservation(
    client: PoolClient,
    orderId: string,
    variantId: string,
    reservationId: string,
  ): Promise<void> {
    const updated = await client.query<IdentifierRow>(
      [
        "UPDATE order_items SET reservation_id = $1",
        "WHERE order_id = $2 AND variant_id = $3",
        "RETURNING id",
      ].join("\n"),
      [reservationId, orderId, variantId],
    );
    if (!updated.rows[0]) throw new Error("Order item is missing while assigning inventory reservation.");
  }

  async clearReservations(client: PoolClient, orderId: string): Promise<void> {
    await client.query("UPDATE order_items SET reservation_id = NULL WHERE order_id = $1", [orderId]);
  }

  async setStatus(client: PoolClient, orderId: string, status: OrderStatus): Promise<void> {
    await client.query(
      "UPDATE orders SET status = $1, version = version + 1 WHERE id = $2",
      [status, orderId],
    );
  }

  async failOutOfStock(
    client: PoolClient,
    orderId: string,
    actor: OrderActor,
    code: string,
    message: string,
  ): Promise<void> {
    await client.query(
      [
        "UPDATE orders",
        "SET status = 'CANCELLED', cancellation_reason = $1, cancelled_by = $2,",
        "  cancelled_by_role = $3, cancelled_at = NOW(), version = version + 1",
        "WHERE id = $4",
      ].join("\n"),
      [message, actor.id, actor.role, orderId],
    );
    await client.query(
      [
        "UPDATE orders_idempotency",
        "SET outcome_code = $1, outcome_message = $2",
        "WHERE order_id = $3",
      ].join("\n"),
      [code, message, orderId],
    );
    await this.audit(client, orderId, actor, "ORDER_REJECTED_OUT_OF_STOCK");
  }

  async cancel(
    client: PoolClient,
    orderId: string,
    actor: OrderActor,
    reason: string | null,
  ): Promise<void> {
    await client.query(
      [
        "UPDATE orders",
        "SET status = 'CANCELLED', cancellation_reason = $1, cancelled_by = $2,",
        "  cancelled_by_role = $3, cancelled_at = NOW(), version = version + 1",
        "WHERE id = $4",
      ].join("\n"),
      [reason, actor.id, actor.role, orderId],
    );
    await this.audit(client, orderId, actor, "ORDER_CANCELLED");
  }

  async audit(
    client: PoolClient,
    orderId: string,
    actor: OrderActor | null,
    action: string,
  ): Promise<void> {
    await client.query(
      [
        "INSERT INTO orders_audit_log (order_id, actor_id, actor_role, action, correlation_id, result)",
        "VALUES ($1, $2, $3, $4, $5, 'SUCCEEDED')",
      ].join("\n"),
      [orderId, actor?.id ?? null, actor?.role ?? null, action, actor?.correlationId ?? null],
    );
  }

  private orderSelect(forUpdate: boolean, suffix = ""): string {
    return [
      "SELECT id, customer_id, created_by, created_by_role, branch_id, status, currency,",
      "  subtotal, discount_total, total, cancellation_reason, cancelled_at, version, created_at, updated_at",
      "FROM orders WHERE id = $1",
      forUpdate ? "FOR UPDATE" : "",
      suffix,
    ].filter(Boolean).join("\n");
  }

  private itemSelect(): string {
    return [
      "SELECT id, product_id, category_id, variant_id, branch_id, product_name, sku, variant_label,",
      "  quantity, list_unit_price, unit_price, line_discount_total, line_total, currency, reservation_id",
      "FROM order_items WHERE order_id = $1 ORDER BY id ASC",
    ].join("\n");
  }

  private ordersListSelect(): string {
    return [
      "SELECT id, customer_id, created_by, created_by_role, branch_id, status, currency,",
      "  subtotal, discount_total, total, cancellation_reason, cancelled_at, version, created_at, updated_at",
      "FROM orders ORDER BY created_at DESC, id DESC",
    ].join("\n");
  }

  private async itemsFor(client: PoolClient, orderId: string): Promise<OrderItem[]> {
    const rows = await client.query<ItemRow>(this.itemSelect(), [orderId]);
    return rows.rows.map((row) => this.toItem(row));
  }

  private toOrder(row: OrderRow, items: OrderItem[]): StoredOrder {
    return {
      id: row.id,
      customerId: row.customer_id,
      createdBy: row.created_by,
      createdByRole: row.created_by_role,
      branchId: row.branch_id,
      status: row.status,
      currency: row.currency,
      subtotal: this.money(Number(row.subtotal)),
      discountTotal: this.money(Number(row.discount_total)),
      total: this.money(Number(row.total)),
      cancellationReason: row.cancellation_reason,
      cancelledAt: row.cancelled_at ? this.iso(row.cancelled_at) : null,
      version: row.version,
      createdAt: this.iso(row.created_at),
      updatedAt: this.iso(row.updated_at),
      items,
    };
  }

  private toItem(row: ItemRow): OrderItem {
    return {
      id: row.id,
      productId: row.product_id,
      categoryId: row.category_id,
      variantId: row.variant_id,
      branchId: row.branch_id,
      productName: row.product_name,
      sku: row.sku,
      variantLabel: row.variant_label,
      quantity: row.quantity,
      listUnitPrice: this.money(Number(row.list_unit_price)),
      unitPrice: this.money(Number(row.unit_price)),
      lineDiscountTotal: this.money(Number(row.line_discount_total)),
      lineTotal: this.money(Number(row.line_total)),
      currency: row.currency,
      reservationId: row.reservation_id,
    };
  }

  private toIdempotency(row: IdempotencyRow): IdempotencyRecord {
    return {
      actorId: row.actor_id,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      orderId: row.order_id,
      outcomeCode: row.outcome_code,
      outcomeMessage: row.outcome_message,
    };
  }

  private money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private iso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}
