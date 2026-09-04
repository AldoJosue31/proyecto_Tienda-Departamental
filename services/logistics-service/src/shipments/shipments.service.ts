import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { ApiException } from "../common/api-exception";
import type { Role } from "../config/environment";
import { DatabaseService } from "../database/database.service";
import { LogisticsOutboxService } from "../events/outbox.service";
import type {
  CancelledOrderEvent,
  CompletedOrderEvent,
  CourierLocation,
  CourierLocationRequest,
  CourierLocationResponse,
  LogisticsEvent,
  Shipment,
  ShipmentActor,
  ShipmentDetailResponse,
  ShipmentItem,
  ShipmentListResponse,
  ShipmentReadActor,
  ShipmentStatus,
  ShipmentStatusRequest,
  ShipmentTracking,
  ShipmentTransition,
  TrackingAssignmentRequest,
  TrackingFreshness,
} from "./shipments.types";

interface ShipmentRow extends QueryResultRow {
  id: string;
  order_id: string;
  customer_id: string;
  branch_id: string;
  currency: string;
  total: string | number;
  items: unknown;
  status: ShipmentStatus;
  version: number;
  courier_id: string | null;
  delivery_address: string | null;
  packed_at: Date | string | null;
  shipped_at: Date | string | null;
  cancelled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CourierRow extends QueryResultRow {
  id: string;
  display_name: string;
  last_latitude: string | number | null;
  last_longitude: string | number | null;
  last_location_at: Date | string | null;
}

interface TransitionRow extends QueryResultRow {
  id: string;
  from_status: ShipmentStatus | null;
  to_status: ShipmentStatus;
  actor_id: string | null;
  actor_role: Role | null;
  source: "ORDER_EVENT" | "OPERATIONS" | "SYSTEM";
  created_at: Date | string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOARD_STATUSES: ShipmentStatus[] = ["PENDING", "PACKING", "SHIPPED"];
const OPERATION_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ["PACKING"],
  PACKING: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};
const TRACKING_STALE_AFTER_MILLISECONDS = 5 * 60 * 1_000;

export function allowedOperationalTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return OPERATION_TRANSITIONS[from].includes(to);
}

export function trackingFreshness(recordedAt: string | null, now = Date.now()): TrackingFreshness {
  if (!recordedAt) return "UNAVAILABLE";
  const timestamp = Date.parse(recordedAt);
  if (Number.isNaN(timestamp) || now - timestamp > TRACKING_STALE_AFTER_MILLISECONDS) return "STALE";
  return "RECENT";
}

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly outbox: LogisticsOutboxService,
  ) {}

  async project(event: LogisticsEvent): Promise<void> {
    await this.database.withTransaction(async (client) => {
      const claimed = await client.query<{ event_id: string }>(
        "INSERT INTO logistics_processed_events (event_id, event_type, occurred_at, correlation_id) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
        [event.eventId, event.eventType, event.occurredAt, event.correlationId],
      );
      if (!claimed.rows[0]) return;
      if (event.eventType === "order.completed.v1") await this.projectCompletedOrder(client, event);
      else await this.projectCancelledOrder(client, event);
    });
  }

  async list(actor: ShipmentReadActor): Promise<ShipmentListResponse> {
    const result = actor.role === "CUSTOMER"
      ? await this.database.query<ShipmentRow>(
        "SELECT * FROM logistics_shipments WHERE customer_id = $1 ORDER BY updated_at DESC, id DESC",
        [actor.id],
      )
      : await this.database.query<ShipmentRow>(
        "SELECT * FROM logistics_shipments WHERE status = ANY($1) ORDER BY CASE status WHEN 'PENDING' THEN 1 WHEN 'PACKING' THEN 2 ELSE 3 END, updated_at ASC, id ASC",
        [BOARD_STATUSES],
      );
    return { shipments: result.rows.map((row) => this.publicShipment(row)), refreshedAt: new Date().toISOString() };
  }

  async detail(id: string, actor: ShipmentReadActor): Promise<ShipmentDetailResponse> {
    const shipmentId = this.id(id);
    const shipment = await this.requireShipment(shipmentId);
    this.assertCanRead(shipment, actor);
    return this.detailFromShipment(shipment, actor.role !== "CUSTOMER");
  }

  async changeStatus(id: string, input: ShipmentStatusRequest, actor: ShipmentActor): Promise<ShipmentDetailResponse> {
    const shipmentId = this.id(id);
    const desired = this.status(input.status);
    const version = this.version(input.version);
    const shipment = await this.database.withTransaction(async (client) => {
      const result = await client.query<ShipmentRow>("SELECT * FROM logistics_shipments WHERE id = $1 FOR UPDATE", [shipmentId]);
      const current = result.rows[0];
      if (!current) throw new ApiException(404, "SHIPMENT_NOT_FOUND", "Envío no encontrado");
      if (current.version !== version) throw new ApiException(409, "SHIPMENT_VERSION_CONFLICT", "El envío fue actualizado por otra sesión. Actualiza el tablero e inténtalo de nuevo.");
      if (!allowedOperationalTransition(current.status, desired)) throw new ApiException(409, "INVALID_SHIPMENT_TRANSITION", "La transición de estado solicitada no está permitida");
      const updated = await client.query<ShipmentRow>([
        "UPDATE logistics_shipments SET status = $1, version = version + 1,",
        "packed_at = CASE WHEN $2 THEN NOW() ELSE packed_at END,",
        "shipped_at = CASE WHEN $3 THEN NOW() ELSE shipped_at END",
        "WHERE id = $4 AND version = $5 RETURNING *",
      ].join("\n"), [desired, desired === "PACKING", desired === "SHIPPED", shipmentId, version]);
      const row = updated.rows[0];
      if (!row) throw new ApiException(409, "SHIPMENT_VERSION_CONFLICT", "El envío fue actualizado por otra sesión. Actualiza el tablero e inténtalo de nuevo.");
      await this.audit(client, row.id, current.status, desired, actor.id, actor.role, actor.correlationId, "OPERATIONS");
      await this.enqueueStatusChanged(client, row, actor.correlationId, current.status);
      return row;
    });
    return this.detailFromShipment(shipment, true);
  }

  async assignTracking(id: string, input: TrackingAssignmentRequest): Promise<ShipmentDetailResponse> {
    const shipmentId = this.id(id);
    const courierId = this.id(this.text(input.courierId, "El repartidor es obligatorio", 36));
    const courierName = this.text(input.courierName, "El nombre del repartidor es obligatorio", 120);
    const deliveryAddress = this.text(input.deliveryAddress, "La dirección de entrega es obligatoria", 500);
    const version = this.version(input.version);
    const shipment = await this.database.withTransaction(async (client) => {
      const result = await client.query<ShipmentRow>("SELECT * FROM logistics_shipments WHERE id = $1 FOR UPDATE", [shipmentId]);
      const current = result.rows[0];
      if (!current) throw new ApiException(404, "SHIPMENT_NOT_FOUND", "Envío no encontrado");
      if (current.status === "CANCELLED" || current.status === "DELIVERED") throw new ApiException(409, "SHIPMENT_NOT_TRACKABLE", "No se puede configurar seguimiento para un envío cerrado");
      if (current.version !== version) throw new ApiException(409, "SHIPMENT_VERSION_CONFLICT", "El envío fue actualizado por otra sesión. Actualiza el tablero e inténtalo de nuevo.");
      await client.query([
        "INSERT INTO logistics_couriers (id, display_name) VALUES ($1, $2)",
        "ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name",
      ].join("\n"), [courierId, courierName]);
      const updated = await client.query<ShipmentRow>([
        "UPDATE logistics_shipments SET courier_id = $1, delivery_address = $2, version = version + 1",
        "WHERE id = $3 AND version = $4 RETURNING *",
      ].join("\n"), [courierId, deliveryAddress, shipmentId, version]);
      const row = updated.rows[0];
      if (!row) throw new ApiException(409, "SHIPMENT_VERSION_CONFLICT", "El envío fue actualizado por otra sesión. Actualiza el tablero e inténtalo de nuevo.");
      return row;
    });
    return this.detailFromShipment(shipment, true);
  }

  async recordCourierLocation(courierId: string, input: CourierLocationRequest, correlationId: string | null): Promise<CourierLocationResponse> {
    const normalizedCourierId = this.id(courierId);
    const shipmentId = this.id(this.text(input.shipmentId, "El envío es obligatorio", 36));
    const latitude = this.coordinate(input.latitude, -90, 90, "La latitud no es válida");
    const longitude = this.coordinate(input.longitude, -180, 180, "La longitud no es válida");
    const recordedAt = this.timestamp(input.recordedAt);
    return this.database.withTransaction(async (client) => {
      const shipmentResult = await client.query<ShipmentRow>("SELECT * FROM logistics_shipments WHERE id = $1 FOR UPDATE", [shipmentId]);
      const shipment = shipmentResult.rows[0];
      if (!shipment) throw new ApiException(404, "SHIPMENT_NOT_FOUND", "Envío no encontrado");
      if (shipment.courier_id !== normalizedCourierId) throw new ApiException(409, "COURIER_NOT_ASSIGNED", "El repartidor no está asignado a este envío");
      if (shipment.status !== "SHIPPED") throw new ApiException(409, "SHIPMENT_NOT_IN_TRANSIT", "El envío debe estar enviado antes de registrar ubicación");
      const updated = await client.query<CourierRow>([
        "UPDATE logistics_couriers",
        "SET last_latitude = $1, last_longitude = $2, last_location_at = $3",
        "WHERE id = $4 AND (last_location_at IS NULL OR last_location_at <= $3)",
        "RETURNING id, display_name, last_latitude, last_longitude, last_location_at",
      ].join("\n"), [latitude, longitude, recordedAt, normalizedCourierId]);
      const courier = updated.rows[0] ?? (await client.query<CourierRow>(
        "SELECT id, display_name, last_latitude, last_longitude, last_location_at FROM logistics_couriers WHERE id = $1",
        [normalizedCourierId],
      )).rows[0];
      if (!courier || courier.last_latitude === null || courier.last_longitude === null || !courier.last_location_at) throw new ApiException(404, "COURIER_NOT_FOUND", "Repartidor no encontrado");
      const location = this.publicLocation(courier);
      if (updated.rows[0]) await this.enqueueTrackingUpdated(client, shipment, location, correlationId);
      return { courierId: courier.id, location };
    });
  }

  async courierLocation(courierId: string): Promise<CourierLocationResponse> {
    const normalizedCourierId = this.id(courierId);
    const result = await this.database.query<CourierRow>("SELECT id, display_name, last_latitude, last_longitude, last_location_at FROM logistics_couriers WHERE id = $1", [normalizedCourierId]);
    const courier = result.rows[0];
    if (!courier || courier.last_latitude === null || courier.last_longitude === null || !courier.last_location_at) throw new ApiException(404, "COURIER_LOCATION_NOT_FOUND", "Ubicación de repartidor no disponible");
    return { courierId: courier.id, location: this.publicLocation(courier) };
  }

  private async projectCompletedOrder(client: PoolClient, event: CompletedOrderEvent): Promise<void> {
    const cancelled = await client.query<{ order_id: string }>("SELECT order_id FROM logistics_cancelled_orders WHERE order_id = $1", [event.orderId]);
    const status: ShipmentStatus = cancelled.rows[0] ? "CANCELLED" : "PENDING";
    const inserted = await client.query<ShipmentRow>([
      "INSERT INTO logistics_shipments (order_id, customer_id, branch_id, currency, total, items, status, cancelled_at)",
      "VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz)",
      "ON CONFLICT (order_id) DO NOTHING RETURNING *",
    ].join("\n"), [event.orderId, event.customerId, event.branchId, event.currency, event.total, JSON.stringify(event.items), status, status === "CANCELLED" ? event.occurredAt : null]);
    const row = inserted.rows[0];
    if (!row) return;
    await this.audit(client, row.id, null, status, null, null, event.correlationId, "ORDER_EVENT");
    await this.enqueueStatusChanged(client, row, event.correlationId, null);
  }

  private async projectCancelledOrder(client: PoolClient, event: CancelledOrderEvent): Promise<void> {
    await client.query("INSERT INTO logistics_cancelled_orders (order_id, cancelled_at) VALUES ($1, $2) ON CONFLICT (order_id) DO UPDATE SET cancelled_at = LEAST(logistics_cancelled_orders.cancelled_at, EXCLUDED.cancelled_at)", [event.orderId, event.occurredAt]);
    const existing = await client.query<ShipmentRow>("SELECT * FROM logistics_shipments WHERE order_id = $1 FOR UPDATE", [event.orderId]);
    const current = existing.rows[0];
    if (!current || current.status === "CANCELLED" || current.status === "SHIPPED" || current.status === "DELIVERED") return;
    const updated = await client.query<ShipmentRow>("UPDATE logistics_shipments SET status = 'CANCELLED', version = version + 1, cancelled_at = $2 WHERE id = $1 RETURNING *", [current.id, event.occurredAt]);
    const row = updated.rows[0];
    if (!row) return;
    await this.audit(client, row.id, current.status, "CANCELLED", null, null, event.correlationId, "ORDER_EVENT");
    await this.enqueueStatusChanged(client, row, event.correlationId, current.status);
  }

  private async detailFromShipment(shipment: ShipmentRow, includeTracking: boolean): Promise<ShipmentDetailResponse> {
    const transitions = await this.database.query<TransitionRow>("SELECT id, from_status, to_status, actor_id, actor_role, source, created_at FROM logistics_shipment_transitions WHERE shipment_id = $1 ORDER BY created_at DESC, id DESC", [shipment.id]);
    const response: ShipmentDetailResponse = {
      shipment: this.publicShipment(shipment),
      transitions: transitions.rows.map((row) => this.publicTransition(row, includeTracking)),
    };
    if (includeTracking) {
      const tracking = await this.tracking(shipment);
      if (tracking) response.tracking = tracking;
    }
    return response;
  }

  private async tracking(shipment: ShipmentRow): Promise<ShipmentTracking | null> {
    if (!shipment.courier_id || !shipment.delivery_address) return null;
    const result = await this.database.query<CourierRow>("SELECT id, display_name, last_latitude, last_longitude, last_location_at FROM logistics_couriers WHERE id = $1", [shipment.courier_id]);
    const courier = result.rows[0];
    if (!courier) return null;
    const location = courier.last_latitude === null || courier.last_longitude === null || !courier.last_location_at ? null : this.publicLocation(courier);
    return {
      courier: { id: courier.id, name: courier.display_name },
      location,
      locationFreshness: trackingFreshness(location?.recordedAt ?? null),
      deliveryAddress: shipment.delivery_address,
    };
  }

  private async requireShipment(id: string): Promise<ShipmentRow> {
    const result = await this.database.query<ShipmentRow>("SELECT * FROM logistics_shipments WHERE id = $1", [id]);
    const row = result.rows[0];
    if (!row) throw new ApiException(404, "SHIPMENT_NOT_FOUND", "Envío no encontrado");
    return row;
  }

  private assertCanRead(shipment: ShipmentRow, actor: ShipmentReadActor): void {
    if (actor.role === "CUSTOMER" && shipment.customer_id !== actor.id) throw new ApiException(403, "FORBIDDEN", "No puedes consultar este envío");
  }

  private async audit(client: PoolClient, shipmentId: string, from: ShipmentStatus | null, to: ShipmentStatus, actorId: string | null, actorRole: Role | null, correlationId: string | null, source: "ORDER_EVENT" | "OPERATIONS" | "SYSTEM"): Promise<void> {
    await client.query("INSERT INTO logistics_shipment_transitions (shipment_id, from_status, to_status, actor_id, actor_role, correlation_id, source) VALUES ($1, $2, $3, $4, $5, $6, $7)", [shipmentId, from, to, actorId, actorRole, correlationId, source]);
  }

  private async enqueueStatusChanged(client: PoolClient, shipment: ShipmentRow, correlationId: string | null, previousStatus: ShipmentStatus | null): Promise<void> {
    await this.outbox.enqueue(client, {
      eventType: "shipment.status.changed.v1",
      correlationId,
      data: { shipmentId: shipment.id, orderId: shipment.order_id, customerId: shipment.customer_id, branchId: shipment.branch_id, previousStatus, status: shipment.status, version: shipment.version, packedAt: this.isoOrNull(shipment.packed_at), shippedAt: this.isoOrNull(shipment.shipped_at), cancelledAt: this.isoOrNull(shipment.cancelled_at), updatedAt: this.iso(shipment.updated_at) },
    });
  }

  private async enqueueTrackingUpdated(client: PoolClient, shipment: ShipmentRow, location: CourierLocation, correlationId: string | null): Promise<void> {
    await this.outbox.enqueue(client, {
      eventType: "shipment.tracking.updated.v1",
      correlationId,
      data: { shipmentId: shipment.id, courierId: shipment.courier_id, location, updatedAt: location.recordedAt },
    });
  }

  private publicShipment(row: ShipmentRow): Shipment {
    return { id: row.id, orderId: row.order_id, customerId: row.customer_id, branchId: row.branch_id, currency: row.currency, total: this.number(row.total), items: this.items(row.items), status: row.status, version: row.version, packedAt: this.isoOrNull(row.packed_at), shippedAt: this.isoOrNull(row.shipped_at), cancelledAt: this.isoOrNull(row.cancelled_at), createdAt: this.iso(row.created_at), updatedAt: this.iso(row.updated_at) };
  }

  private publicTransition(row: TransitionRow, includeActors: boolean): ShipmentTransition {
    return { id: row.id, fromStatus: row.from_status, toStatus: row.to_status, actorId: includeActors ? row.actor_id : null, actorRole: includeActors ? row.actor_role : null, source: row.source, createdAt: this.iso(row.created_at) };
  }

  private publicLocation(row: CourierRow): CourierLocation {
    return { latitude: this.number(row.last_latitude), longitude: this.number(row.last_longitude), recordedAt: this.iso(row.last_location_at as Date | string) };
  }

  private id(value: string): string {
    if (!UUID.test(value.trim())) throw new ApiException(404, "SHIPMENT_NOT_FOUND", "Envío no encontrado");
    return value.trim();
  }

  private status(value: string): ShipmentStatus {
    if ((["PENDING", "PACKING", "SHIPPED", "DELIVERED", "CANCELLED"] as string[]).includes(value)) return value as ShipmentStatus;
    throw new ApiException(400, "VALIDATION_ERROR", "El estado de envío no es válido");
  }

  private version(value: unknown): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new ApiException(400, "VALIDATION_ERROR", "La versión del envío es obligatoria");
    return value;
  }

  private text(value: unknown, message: string, maxLength: number): string {
    if (typeof value !== "string") throw new ApiException(400, "VALIDATION_ERROR", message);
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized || normalized.length > maxLength) throw new ApiException(400, "VALIDATION_ERROR", message);
    return normalized;
  }

  private coordinate(value: unknown, minimum: number, maximum: number, message: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new ApiException(400, "VALIDATION_ERROR", message);
    return value;
  }

  private timestamp(value: unknown): string {
    if (value === undefined || value === null || value === "") return new Date().toISOString();
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new ApiException(400, "VALIDATION_ERROR", "El timestamp de ubicación no es válido");
    const parsed = new Date(value);
    if (parsed.getTime() > Date.now() + 5 * 60 * 1_000) throw new ApiException(400, "VALIDATION_ERROR", "El timestamp de ubicación no puede estar en el futuro");
    return parsed.toISOString();
  }

  private items(value: unknown): ShipmentItem[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ShipmentItem => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).productId === "string" && typeof (item as Record<string, unknown>).variantId === "string" && typeof (item as Record<string, unknown>).productName === "string" && typeof (item as Record<string, unknown>).sku === "string" && typeof (item as Record<string, unknown>).variantLabel === "string" && typeof (item as Record<string, unknown>).quantity === "number" && typeof (item as Record<string, unknown>).lineTotal === "number");
  }

  private iso(value: Date | string): string { return (value instanceof Date ? value : new Date(value)).toISOString(); }
  private isoOrNull(value: Date | string | null): string | null { return value ? this.iso(value) : null; }
  private number(value: string | number | null): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
}
