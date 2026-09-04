import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { ApiException } from "../common/api-exception";
import type { Role } from "../config/environment";
import { DatabaseService } from "../database/database.service";
import { LogisticsOutboxService } from "../events/outbox.service";
import type { CancelledOrderEvent, CompletedOrderEvent, LogisticsEvent, Shipment, ShipmentActor, ShipmentDetailResponse, ShipmentItem, ShipmentListResponse, ShipmentStatus, ShipmentStatusRequest, ShipmentTransition } from "./shipments.types";

interface ShipmentRow extends QueryResultRow {
  id: string; order_id: string; customer_id: string; branch_id: string; currency: string; total: string | number; items: unknown; status: ShipmentStatus; version: number;
  packed_at: Date | string | null; shipped_at: Date | string | null; cancelled_at: Date | string | null; created_at: Date | string; updated_at: Date | string;
}
interface TransitionRow extends QueryResultRow { id: string; from_status: ShipmentStatus | null; to_status: ShipmentStatus; actor_id: string | null; actor_role: Role | null; source: "ORDER_EVENT" | "OPERATIONS" | "SYSTEM"; created_at: Date | string; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOARD_STATUSES: ShipmentStatus[] = ["PENDING", "PACKING", "SHIPPED"];
const OPERATION_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = { PENDING: ["PACKING"], PACKING: ["SHIPPED"], SHIPPED: [], DELIVERED: [], CANCELLED: [] };

export function allowedOperationalTransition(from: ShipmentStatus, to: ShipmentStatus): boolean { return OPERATION_TRANSITIONS[from].includes(to); }

@Injectable()
export class ShipmentsService {
  constructor(private readonly database: DatabaseService, private readonly outbox: LogisticsOutboxService) {}

  async project(event: LogisticsEvent): Promise<void> {
    await this.database.withTransaction(async (client) => {
      const claimed = await client.query<{ event_id: string }>("INSERT INTO logistics_processed_events (event_id, event_type, occurred_at, correlation_id) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id", [event.eventId, event.eventType, event.occurredAt, event.correlationId]);
      if (!claimed.rows[0]) return;
      if (event.eventType === "order.completed.v1") await this.projectCompletedOrder(client, event);
      else await this.projectCancelledOrder(client, event);
    });
  }

  async list(): Promise<ShipmentListResponse> {
    const result = await this.database.query<ShipmentRow>("SELECT * FROM logistics_shipments WHERE status = ANY($1) ORDER BY CASE status WHEN 'PENDING' THEN 1 WHEN 'PACKING' THEN 2 ELSE 3 END, updated_at ASC, id ASC", [BOARD_STATUSES]);
    return { shipments: result.rows.map((row) => this.publicShipment(row)), refreshedAt: new Date().toISOString() };
  }

  async detail(id: string): Promise<ShipmentDetailResponse> {
    const shipmentId = this.id(id); const shipment = await this.requireShipment(shipmentId); const transitions = await this.database.query<TransitionRow>("SELECT id, from_status, to_status, actor_id, actor_role, source, created_at FROM logistics_shipment_transitions WHERE shipment_id = $1 ORDER BY created_at DESC, id DESC", [shipmentId]);
    return { shipment: this.publicShipment(shipment), transitions: transitions.rows.map((row) => this.publicTransition(row)) };
  }

  async changeStatus(id: string, input: ShipmentStatusRequest, actor: ShipmentActor): Promise<ShipmentDetailResponse> {
    const shipmentId = this.id(id); const desired = this.status(input.status); const version = this.version(input.version);
    const shipment = await this.database.withTransaction(async (client) => {
      const result = await client.query<ShipmentRow>("SELECT * FROM logistics_shipments WHERE id = $1 FOR UPDATE", [shipmentId]); const current = result.rows[0];
      if (!current) throw new ApiException(404, "SHIPMENT_NOT_FOUND", "Envío no encontrado");
      if (current.version !== version) throw new ApiException(409, "SHIPMENT_VERSION_CONFLICT", "El envío fue actualizado por otra sesión. Actualiza el tablero e inténtalo de nuevo.");
      if (!allowedOperationalTransition(current.status, desired)) throw new ApiException(409, "INVALID_SHIPMENT_TRANSITION", "La transición de estado solicitada no está permitida");
      const updated = await client.query<ShipmentRow>([
        "UPDATE logistics_shipments SET status = $1, version = version + 1,",
        "packed_at = CASE WHEN $2 THEN NOW() ELSE packed_at END,",
        "shipped_at = CASE WHEN $3 THEN NOW() ELSE shipped_at END",
        "WHERE id = $4 AND version = $5 RETURNING *",
      ].join("\n"), [desired, desired === "PACKING", desired === "SHIPPED", shipmentId, version]);
      const row = updated.rows[0]; if (!row) throw new ApiException(409, "SHIPMENT_VERSION_CONFLICT", "El envío fue actualizado por otra sesión. Actualiza el tablero e inténtalo de nuevo.");
      await this.audit(client, row.id, current.status, desired, actor.id, actor.role, actor.correlationId, "OPERATIONS");
      await this.enqueueStatusChanged(client, row, actor.correlationId, current.status);
      return row;
    });
    return this.detailFromShipment(shipment);
  }

  private async projectCompletedOrder(client: PoolClient, event: CompletedOrderEvent): Promise<void> {
    const cancelled = await client.query<{ order_id: string }>("SELECT order_id FROM logistics_cancelled_orders WHERE order_id = $1", [event.orderId]);
    const status: ShipmentStatus = cancelled.rows[0] ? "CANCELLED" : "PENDING";
    const inserted = await client.query<ShipmentRow>([
      "INSERT INTO logistics_shipments (order_id, customer_id, branch_id, currency, total, items, status, cancelled_at)",
      "VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz)",
      "ON CONFLICT (order_id) DO NOTHING RETURNING *",
    ].join("\n"), [event.orderId, event.customerId, event.branchId, event.currency, event.total, JSON.stringify(event.items), status, status === "CANCELLED" ? event.occurredAt : null]);
    const row = inserted.rows[0]; if (!row) return;
    await this.audit(client, row.id, null, status, null, null, event.correlationId, "ORDER_EVENT");
    await this.enqueueStatusChanged(client, row, event.correlationId, null);
  }

  private async projectCancelledOrder(client: PoolClient, event: CancelledOrderEvent): Promise<void> {
    await client.query("INSERT INTO logistics_cancelled_orders (order_id, cancelled_at) VALUES ($1, $2) ON CONFLICT (order_id) DO UPDATE SET cancelled_at = LEAST(logistics_cancelled_orders.cancelled_at, EXCLUDED.cancelled_at)", [event.orderId, event.occurredAt]);
    const existing = await client.query<ShipmentRow>("SELECT * FROM logistics_shipments WHERE order_id = $1 FOR UPDATE", [event.orderId]); const current = existing.rows[0];
    if (!current || current.status === "CANCELLED" || current.status === "SHIPPED" || current.status === "DELIVERED") return;
    const updated = await client.query<ShipmentRow>("UPDATE logistics_shipments SET status = 'CANCELLED', version = version + 1, cancelled_at = $2 WHERE id = $1 RETURNING *", [current.id, event.occurredAt]); const row = updated.rows[0];
    if (!row) return;
    await this.audit(client, row.id, current.status, "CANCELLED", null, null, event.correlationId, "ORDER_EVENT");
    await this.enqueueStatusChanged(client, row, event.correlationId, current.status);
  }

  private async detailFromShipment(shipment: ShipmentRow): Promise<ShipmentDetailResponse> {
    const transitions = await this.database.query<TransitionRow>("SELECT id, from_status, to_status, actor_id, actor_role, source, created_at FROM logistics_shipment_transitions WHERE shipment_id = $1 ORDER BY created_at DESC, id DESC", [shipment.id]);
    return { shipment: this.publicShipment(shipment), transitions: transitions.rows.map((row) => this.publicTransition(row)) };
  }

  private async requireShipment(id: string): Promise<ShipmentRow> { const result = await this.database.query<ShipmentRow>("SELECT * FROM logistics_shipments WHERE id = $1", [id]); const row = result.rows[0]; if (!row) throw new ApiException(404, "SHIPMENT_NOT_FOUND", "Envío no encontrado"); return row; }
  private async audit(client: PoolClient, shipmentId: string, from: ShipmentStatus | null, to: ShipmentStatus, actorId: string | null, actorRole: Role | null, correlationId: string | null, source: "ORDER_EVENT" | "OPERATIONS" | "SYSTEM"): Promise<void> { await client.query("INSERT INTO logistics_shipment_transitions (shipment_id, from_status, to_status, actor_id, actor_role, correlation_id, source) VALUES ($1, $2, $3, $4, $5, $6, $7)", [shipmentId, from, to, actorId, actorRole, correlationId, source]); }
  private async enqueueStatusChanged(client: PoolClient, shipment: ShipmentRow, correlationId: string | null, previousStatus: ShipmentStatus | null): Promise<void> { await this.outbox.enqueue(client, { eventType: "shipment.status.changed.v1", correlationId, data: { shipmentId: shipment.id, orderId: shipment.order_id, customerId: shipment.customer_id, branchId: shipment.branch_id, previousStatus, status: shipment.status, version: shipment.version, packedAt: this.isoOrNull(shipment.packed_at), shippedAt: this.isoOrNull(shipment.shipped_at), cancelledAt: this.isoOrNull(shipment.cancelled_at), updatedAt: this.iso(shipment.updated_at) } }); }
  private publicShipment(row: ShipmentRow): Shipment { return { id: row.id, orderId: row.order_id, customerId: row.customer_id, branchId: row.branch_id, currency: row.currency, total: this.number(row.total), items: this.items(row.items), status: row.status, version: row.version, packedAt: this.isoOrNull(row.packed_at), shippedAt: this.isoOrNull(row.shipped_at), cancelledAt: this.isoOrNull(row.cancelled_at), createdAt: this.iso(row.created_at), updatedAt: this.iso(row.updated_at) }; }
  private publicTransition(row: TransitionRow): ShipmentTransition { return { id: row.id, fromStatus: row.from_status, toStatus: row.to_status, actorId: row.actor_id, actorRole: row.actor_role, source: row.source, createdAt: this.iso(row.created_at) }; }
  private id(value: string): string { if (!UUID.test(value.trim())) throw new ApiException(404, "SHIPMENT_NOT_FOUND", "Envío no encontrado"); return value.trim(); }
  private status(value: string): ShipmentStatus { if ((["PENDING", "PACKING", "SHIPPED", "DELIVERED", "CANCELLED"] as string[]).includes(value)) return value as ShipmentStatus; throw new ApiException(400, "VALIDATION_ERROR", "El estado de envío no es válido"); }
  private version(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new ApiException(400, "VALIDATION_ERROR", "La versión del envío es obligatoria"); return value; }
  private items(value: unknown): ShipmentItem[] { if (!Array.isArray(value)) return []; return value.filter((item): item is ShipmentItem => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).productId === "string" && typeof (item as Record<string, unknown>).variantId === "string" && typeof (item as Record<string, unknown>).productName === "string" && typeof (item as Record<string, unknown>).sku === "string" && typeof (item as Record<string, unknown>).variantLabel === "string" && typeof (item as Record<string, unknown>).quantity === "number" && typeof (item as Record<string, unknown>).lineTotal === "number"); }
  private iso(value: Date | string): string { return (value instanceof Date ? value : new Date(value)).toISOString(); }
  private isoOrNull(value: Date | string | null): string | null { return value ? this.iso(value) : null; }
  private number(value: string | number): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
}
