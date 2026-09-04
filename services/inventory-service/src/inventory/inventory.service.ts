import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { INVENTORY_RUNTIME_CONFIG } from "../auth/token.service";
import { ApiException } from "../common/api-exception";
import type { AuthenticatedUser } from "../common/authenticated-request";
import type { InventoryRuntimeConfig, Role } from "../config/environment";
import { DatabaseService } from "../database/database.service";
import { InventoryOutboxService } from "../events/outbox.service";
import {
  cleanOptionalText,
  type CreateMovementDto,
  type CreateReservationDto,
} from "./inventory.dto";
import type {
  InventoryListResponse,
  InventoryReservation,
  InventoryStock,
  MovementResponse,
  MovementType,
  ReservationResponse,
  ReservationStatus,
  VariantSnapshot,
} from "./inventory.types";

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

interface StockRow extends QueryResultRow {
  id: string;
  variant_id: string;
  branch_id: string;
  branch_name: string;
  product_name: string | null;
  sku: string | null;
  variant_label: string | null;
  on_hand: number;
  reserved: number;
  reorder_point: number | null;
  updated_at: Date | string;
}

interface ReservationRow extends StockRow {
  reservation_id: string;
  order_id: string;
  quantity: number;
  status: ReservationStatus;
  expires_at: Date | string;
  committed_at: Date | string | null;
  released_at: Date | string | null;
}

interface IdentifierRow extends QueryResultRow {
  id: string;
}

interface MovementRow extends QueryResultRow {
  id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  created_at: Date | string;
}

interface ExpiredReservationRow extends QueryResultRow {
  id: string;
  stock_id: string;
  quantity: number;
}

interface ReservationStateRow extends QueryResultRow {
  id: string;
  stock_id: string;
  quantity: number;
  status: ReservationStatus;
  expires_at: Date | string;
}

interface MutationActor {
  id: string;
  role: Role;
  correlationId: string | null;
}

interface ReservationOutcome {
  reservation: InventoryReservation | null;
  outOfStock: boolean;
}

interface ReservationTransitionOutcome {
  reservation: InventoryReservation | null;
  expired: boolean;
}

export interface OrderCancelledEvent {
  eventId: string;
  eventType: "order.cancelled.v1";
  occurredAt: string;
  correlationId: string | null;
  producer: "orders-service";
  data: Record<string, unknown>;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly outbox: InventoryOutboxService,
    @Inject(INVENTORY_RUNTIME_CONFIG)
    private readonly config: Pick<InventoryRuntimeConfig, "reservationTtlSeconds">,
  ) {}

  async listInventory(): Promise<InventoryListResponse> {
    const result = await this.database.query<StockRow>(this.stockSelect(
      "ORDER BY b.name ASC, v.product_name ASC NULLS LAST, v.sku ASC NULLS LAST, s.id ASC",
    ));
    return { items: result.rows.map((row) => this.toStock(row)) };
  }

  async listBranchInventory(branchId: string): Promise<InventoryListResponse> {
    const branch = branchId.trim();
    if (!this.isUuid(branch)) {
      throw new ApiException(404, "BRANCH_NOT_FOUND", "Sucursal no encontrada");
    }
    const result = await this.database.query<StockRow>(
      this.stockSelect(
        "WHERE s.branch_id = $1 ORDER BY v.product_name ASC NULLS LAST, v.sku ASC NULLS LAST, s.id ASC",
      ),
      [branch],
    );
    if (result.rows.length > 0) {
      return { items: result.rows.map((row) => this.toStock(row)) };
    }
    const exists = await this.database.query<IdentifierRow>(
      "SELECT id FROM inventory_branches WHERE id = $1",
      [branch],
    );
    if (exists.rows.length === 0) {
      throw new ApiException(404, "BRANCH_NOT_FOUND", "Sucursal no encontrada");
    }
    return { items: [] };
  }

  async listLowStock(): Promise<InventoryListResponse> {
    const result = await this.database.query<StockRow>(this.stockSelect([
      "WHERE s.reorder_point IS NOT NULL",
      "  AND (s.on_hand - s.reserved) <= s.reorder_point",
      "ORDER BY (s.on_hand - s.reserved) ASC, b.name ASC, v.sku ASC NULLS LAST",
    ].join("\n")));
    return { items: result.rows.map((row) => this.toStock(row)) };
  }

  reserve(
    body: CreateReservationDto,
    idempotencyKey: string | undefined,
    correlationId: string | undefined,
  ): Promise<ReservationResponse> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    return this.database.withTransaction<ReservationOutcome>(async (client) => {
      await this.lockIdempotencyKey(client, key);
      const prior = await this.findReservationByIdempotency(client, key);
      if (prior) {
        return { reservation: prior, outOfStock: false };
      }

      await this.releaseExpiredReservations(client, correlationId ?? null);
      const stock = await client.query<StockRow>([
        "UPDATE inventory_stock AS s",
        "SET reserved = reserved + $1",
        "WHERE s.variant_id = $2",
        "  AND s.branch_id = $3",
        "  AND (s.on_hand - s.reserved) >= $1",
        "RETURNING s.id, s.variant_id, s.branch_id,",
        "  s.on_hand, s.reserved, s.reorder_point, s.updated_at",
      ].join("\n"), [body.quantity, body.variantId, body.branchId]);

      const changed = stock.rows[0];
      if (!changed) {
        return { reservation: null, outOfStock: true };
      }

      const expiresAt = new Date(Date.now() + this.config.reservationTtlSeconds * 1000);
      const created = await client.query<IdentifierRow>([
        "INSERT INTO inventory_reservations (",
        "  stock_id, variant_id, branch_id, order_id, actor,",
        "  idempotency_key, quantity, status, expires_at",
        ") VALUES ($1, $2, $3, $4, $5, $6, $7, 'RESERVED', $8)",
        "RETURNING id",
      ].join("\n"), [
        changed.id,
        body.variantId,
        body.branchId,
        body.orderId,
        "orders-service",
        key,
        body.quantity,
        expiresAt,
      ]);
      const reservationId = this.requiredIdentifier(created.rows[0], "Reservation creation failed.");
      await this.insertAudit(
        client,
        null,
        null,
        "RESERVATION_CREATED",
        changed.id,
        correlationId ?? null,
      );
      const reservation = await this.getReservation(client, reservationId);
      if (!reservation) {
        throw new Error("Reservation is missing immediately after creation.");
      }
      await this.enqueueStockEvents(client, reservation.stock, correlationId ?? null);
      return { reservation, outOfStock: false };
    }).then((outcome) => {
      if (outcome.outOfStock || !outcome.reservation) {
        throw new ApiException(
          409,
          "OUT_OF_STOCK",
          "La variante ya no tiene disponibilidad",
        );
      }
      return { reservation: outcome.reservation };
    });
  }

  commitReservation(
    reservationId: string,
    idempotencyKey: string | undefined,
    correlationId: string | undefined,
  ): Promise<ReservationResponse> {
    return this.transitionReservation(
      reservationId,
      idempotencyKey,
      correlationId,
      "COMMIT",
    );
  }

  releaseReservation(
    reservationId: string,
    idempotencyKey: string | undefined,
    correlationId: string | undefined,
  ): Promise<ReservationResponse> {
    return this.transitionReservation(
      reservationId,
      idempotencyKey,
      correlationId,
      "RELEASE",
    );
  }

  createMovement(
    body: CreateMovementDto,
    user: AuthenticatedUser,
    correlationId: string | undefined,
  ): Promise<MovementResponse> {
    const actor: MutationActor = {
      id: user.id,
      role: user.role,
      correlationId: correlationId ?? null,
    };
    return this.database.withTransaction(async (client) => {
      await this.releaseExpiredReservations(client, actor.correlationId);
      const delta = this.onHandDelta(body.type, body.quantity);
      const stockId = await this.findOrCreateStock(client, body, delta);
      const update = await client.query<StockRow>([
        "UPDATE inventory_stock",
        "SET on_hand = on_hand + $1,",
        "  reorder_point = COALESCE($2, reorder_point)",
        "WHERE id = $3",
        "  AND on_hand + $1 >= reserved",
        "RETURNING id, variant_id, branch_id, on_hand, reserved, reorder_point, updated_at",
      ].join("\n"), [delta, body.reorderPoint ?? null, stockId]);
      if (!update.rows[0]) {
        throw new ApiException(
          409,
          "OUT_OF_STOCK",
          "La variante ya no tiene disponibilidad",
        );
      }
      const createdMovement = await client.query<MovementRow>([
        "INSERT INTO inventory_movements (",
        "  stock_id, type, quantity, on_hand_delta, reserved_delta,",
        "  reason, actor_id, actor_role, correlation_id",
        ") VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8)",
        "RETURNING id, type, quantity, reason, created_at",
      ].join("\n"), [
        stockId,
        body.type,
        body.quantity,
        delta,
        cleanOptionalText(body.reason),
        actor.id,
        actor.role,
        actor.correlationId,
      ]);
      const movement = createdMovement.rows[0];
      if (!movement) {
        throw new Error("Movement creation failed.");
      }
      await this.insertAudit(
        client,
        actor.id,
        actor.role,
        "INVENTORY_MOVEMENT_CREATED",
        stockId,
        actor.correlationId,
      );
      const stock = await this.getStock(client, stockId);
      if (!stock) {
        throw new Error("Stock is missing immediately after movement.");
      }
      await this.enqueueStockEvents(client, stock, actor.correlationId);
      return {
        movement: {
          id: movement.id,
          type: movement.type,
          quantity: movement.quantity,
          reason: movement.reason,
          createdAt: this.toIso(movement.created_at),
        },
        stock,
      };
    });
  }

  async restoreCancelledOrder(event: OrderCancelledEvent): Promise<void> {
    const items = this.cancellationItems(event);
    await this.database.withTransaction(async (client) => {
      const processed = await client.query<IdentifierRow>([
        "INSERT INTO inventory_processed_events (event_id, event_type, producer)",
        "VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING",
        "RETURNING event_id AS id",
      ].join("\n"), [event.eventId, event.eventType, event.producer]);
      if (!processed.rows[0]) return;

      for (const item of items) {
        const stock = await client.query<IdentifierRow>([
          "SELECT id FROM inventory_stock",
          "WHERE variant_id = $1 AND branch_id = $2 FOR UPDATE",
        ].join("\n"), [item.variantId, item.branchId]);
        const stockId = stock.rows[0]?.id;
        if (!stockId) throw new Error("Cancelled order stock does not exist in Inventory.");
        const updated = await client.query<IdentifierRow>([
          "UPDATE inventory_stock SET on_hand = on_hand + $1",
          "WHERE id = $2 RETURNING id",
        ].join("\n"), [item.quantity, stockId]);
        if (!updated.rows[0]) throw new Error("Cancelled order stock restoration failed.");
        await this.insertMovement(
          client,
          stockId,
          "ORDER_CANCELLATION_RESTOCK",
          item.quantity,
          item.quantity,
          0,
          "Reposición por cancelación de pedido",
          null,
          null,
          event.correlationId,
        );
        await this.insertAudit(
          client,
          null,
          null,
          "ORDER_CANCELLATION_RESTOCKED",
          stockId,
          event.correlationId,
        );
        const restored = await this.getStock(client, stockId);
        if (!restored) throw new Error("Restored stock is missing.");
        await this.enqueueStockEvents(client, restored, event.correlationId);
      }
    });
  }

  private transitionReservation(
    reservationId: string,
    idempotencyKey: string | undefined,
    correlationId: string | undefined,
    operation: "COMMIT" | "RELEASE",
  ): Promise<ReservationResponse> {
    const id = reservationId.trim();
    if (!this.isUuid(id)) {
      throw new ApiException(404, "RESERVATION_NOT_FOUND", "Reserva no encontrada");
    }
    const key = this.requireIdempotencyKey(idempotencyKey);
    return this.database.withTransaction<ReservationTransitionOutcome>(async (client) => {
      await this.lockIdempotencyKey(client, key);
      const priorOperation = await client.query<IdentifierRow>(
        [
          "SELECT reservation_id AS id",
          "FROM inventory_reservation_operations",
          "WHERE actor = 'orders-service' AND idempotency_key = $1",
          "LIMIT 1",
        ].join("\n"),
        [key],
      );
      const previousReservationId = priorOperation.rows[0]?.id;
      if (previousReservationId) {
        const previous = await this.getReservation(client, previousReservationId);
        if (!previous) {
          throw new Error("Stored reservation operation points to a missing reservation.");
        }
        return { reservation: previous, expired: false };
      }

      const state = await client.query<ReservationStateRow>([
        "SELECT id, stock_id, quantity, status, expires_at",
        "FROM inventory_reservations",
        "WHERE id = $1",
        "FOR UPDATE",
      ].join("\n"), [id]);
      const reservation = state.rows[0];
      if (!reservation) {
        throw new ApiException(404, "RESERVATION_NOT_FOUND", "Reserva no encontrada");
      }
      if (reservation.status === "RESERVED" && this.toDate(reservation.expires_at) <= new Date()) {
        await this.expireReservation(client, reservation, correlationId ?? null);
        return { reservation: null, expired: true };
      }
      if (reservation.status !== "RESERVED") {
        const current = await this.getReservation(client, reservation.id);
        if (!current) {
          throw new Error("Reservation is missing.");
        }
        return { reservation: current, expired: false };
      }

      if (operation === "COMMIT") {
        await this.consumeReservation(client, reservation, correlationId ?? null);
      } else {
        await this.releaseReservationStock(client, reservation, correlationId ?? null, "RELEASED");
      }
      await client.query([
        "INSERT INTO inventory_reservation_operations (",
        "  reservation_id, actor, idempotency_key, operation",
        ") VALUES ($1, 'orders-service', $2, $3)",
      ].join("\n"), [reservation.id, key, operation]);
      const current = await this.getReservation(client, reservation.id);
      if (!current) {
        throw new Error("Reservation is missing after transition.");
      }
      return { reservation: current, expired: false };
    }).then((outcome) => {
      if (outcome.expired) {
        throw new ApiException(409, "RESERVATION_EXPIRED", "La reserva ya venció");
      }
      if (!outcome.reservation) {
        throw new Error("Reservation transition did not return a reservation.");
      }
      return { reservation: outcome.reservation };
    });
  }

  private async consumeReservation(
    client: PoolClient,
    reservation: ReservationStateRow,
    correlationId: string | null,
  ): Promise<void> {
    const updated = await client.query<IdentifierRow>([
      "UPDATE inventory_stock",
      "SET on_hand = on_hand - $1, reserved = reserved - $1",
      "WHERE id = $2 AND reserved >= $1 AND on_hand >= $1",
      "RETURNING id",
    ].join("\n"), [reservation.quantity, reservation.stock_id]);
    if (!updated.rows[0]) {
      throw new Error("Reservation stock invariant failed.");
    }
    await client.query([
      "UPDATE inventory_reservations",
      "SET status = 'COMMITTED', committed_at = NOW()",
      "WHERE id = $1",
    ].join("\n"), [reservation.id]);
    await this.insertMovement(
      client,
      reservation.stock_id,
      "RESERVATION_COMMIT",
      reservation.quantity,
      -reservation.quantity,
      -reservation.quantity,
      "Consumo de reserva confirmada",
      null,
      null,
      correlationId,
    );
    await this.insertAudit(
      client,
      null,
      null,
      "RESERVATION_COMMITTED",
      reservation.stock_id,
      correlationId,
    );
    const stock = await this.getStock(client, reservation.stock_id);
    if (!stock) throw new Error("Committed reservation stock is missing.");
    await this.enqueueStockEvents(client, stock, correlationId);
  }

  private async releaseReservationStock(
    client: PoolClient,
    reservation: ReservationStateRow | ExpiredReservationRow,
    correlationId: string | null,
    status: "RELEASED" | "EXPIRED",
  ): Promise<void> {
    const updated = await client.query<IdentifierRow>([
      "UPDATE inventory_stock",
      "SET reserved = reserved - $1",
      "WHERE id = $2 AND reserved >= $1",
      "RETURNING id",
    ].join("\n"), [reservation.quantity, reservation.stock_id]);
    if (!updated.rows[0]) {
      throw new Error("Reservation release invariant failed.");
    }
    await client.query([
      "UPDATE inventory_reservations",
      "SET status = $1, released_at = NOW()",
      "WHERE id = $2",
    ].join("\n"), [status, reservation.id]);
    await this.insertMovement(
      client,
      reservation.stock_id,
      status === "RELEASED" ? "RESERVATION_RELEASE" : "RESERVATION_EXPIRE",
      reservation.quantity,
      0,
      -reservation.quantity,
      status === "RELEASED" ? "Reserva liberada" : "Reserva vencida",
      null,
      null,
      correlationId,
    );
    await this.insertAudit(
      client,
      null,
      null,
      status === "RELEASED" ? "RESERVATION_RELEASED" : "RESERVATION_EXPIRED",
      reservation.stock_id,
      correlationId,
    );
    const stock = await this.getStock(client, reservation.stock_id);
    if (!stock) throw new Error("Released reservation stock is missing.");
    await this.enqueueStockEvents(client, stock, correlationId);
  }

  private async expireReservation(
    client: PoolClient,
    reservation: ReservationStateRow,
    correlationId: string | null,
  ): Promise<void> {
    await this.releaseReservationStock(client, reservation, correlationId, "EXPIRED");
  }

  private async releaseExpiredReservations(
    client: PoolClient,
    correlationId: string | null,
  ): Promise<void> {
    const expired = await client.query<ExpiredReservationRow>([
      "SELECT id, stock_id, quantity",
      "FROM inventory_reservations",
      "WHERE status = 'RESERVED' AND expires_at <= NOW()",
      "FOR UPDATE",
    ].join("\n"));
    for (const reservation of expired.rows) {
      await this.releaseReservationStock(client, reservation, correlationId, "EXPIRED");
    }
  }

  private async findOrCreateStock(
    client: PoolClient,
    body: CreateMovementDto,
    onHandDelta: number,
  ): Promise<string> {
    const branch = await client.query<IdentifierRow>(
      "SELECT id FROM inventory_branches WHERE id = $1",
      [body.branchId],
    );
    if (!branch.rows[0]) {
      throw new ApiException(404, "BRANCH_NOT_FOUND", "Sucursal no encontrada");
    }

    const existing = await client.query<IdentifierRow>([
      "SELECT id FROM inventory_stock",
      "WHERE variant_id = $1 AND branch_id = $2",
      "FOR UPDATE",
    ].join("\n"), [body.variantId, body.branchId]);
    if (existing.rows[0]) {
      await this.upsertSnapshot(client, body);
      return existing.rows[0].id;
    }
    if (onHandDelta < 0) {
      throw new ApiException(
        409,
        "OUT_OF_STOCK",
        "La variante ya no tiene disponibilidad",
      );
    }
    if (!body.catalogSnapshot) {
      throw new ApiException(
        400,
        "CATALOG_SNAPSHOT_REQUIRED",
        "El primer movimiento de una variante debe incluir su snapshot de catálogo",
      );
    }
    await this.upsertSnapshot(client, body);
    const created = await client.query<IdentifierRow>([
      "INSERT INTO inventory_stock (variant_id, branch_id, on_hand, reserved, reorder_point)",
      "VALUES ($1, $2, 0, 0, $3)",
      "ON CONFLICT (variant_id, branch_id) DO NOTHING",
      "RETURNING id",
    ].join("\n"), [body.variantId, body.branchId, body.reorderPoint ?? null]);
    if (created.rows[0]) {
      return created.rows[0].id;
    }
    const afterConflict = await client.query<IdentifierRow>([
      "SELECT id FROM inventory_stock",
      "WHERE variant_id = $1 AND branch_id = $2",
      "FOR UPDATE",
    ].join("\n"), [body.variantId, body.branchId]);
    return this.requiredIdentifier(afterConflict.rows[0], "Stock creation failed.");
  }

  private async upsertSnapshot(client: PoolClient, body: CreateMovementDto): Promise<void> {
    const snapshot = body.catalogSnapshot;
    if (!snapshot) {
      return;
    }
    await client.query([
      "INSERT INTO inventory_variant_snapshots (variant_id, product_name, sku, variant_label)",
      "VALUES ($1, $2, $3, $4)",
      "ON CONFLICT (variant_id) DO UPDATE SET",
      "  product_name = EXCLUDED.product_name,",
      "  sku = EXCLUDED.sku,",
      "  variant_label = EXCLUDED.variant_label",
    ].join("\n"), [
      body.variantId,
      snapshot.productName.trim(),
      snapshot.sku.trim(),
      snapshot.variantLabel.trim(),
    ]);
  }

  private async findReservationByIdempotency(
    client: PoolClient,
    key: string,
  ): Promise<InventoryReservation | null> {
    const result = await client.query<IdentifierRow>([
      "SELECT id FROM inventory_reservations",
      "WHERE actor = 'orders-service' AND idempotency_key = $1",
      "LIMIT 1 FOR UPDATE",
    ].join("\n"), [key]);
    const id = result.rows[0]?.id;
    return id ? this.getReservation(client, id) : null;
  }

  private async getStock(client: PoolClient, id: string): Promise<InventoryStock | null> {
    const result = await client.query<StockRow>(
      this.stockSelect("WHERE s.id = $1"),
      [id],
    );
    const row = result.rows[0];
    return row ? this.toStock(row) : null;
  }

  private async getReservation(
    client: PoolClient,
    id: string,
  ): Promise<InventoryReservation | null> {
    const result = await client.query<ReservationRow>([
      "SELECT r.id AS reservation_id, r.order_id, r.quantity, r.status,",
      "  r.expires_at, r.committed_at, r.released_at,",
      "  s.id, s.variant_id, s.branch_id, b.name AS branch_name,",
      "  v.product_name, v.sku, v.variant_label,",
      "  s.on_hand, s.reserved, s.reorder_point, s.updated_at",
      "FROM inventory_reservations AS r",
      "JOIN inventory_stock AS s ON s.id = r.stock_id",
      "JOIN inventory_branches AS b ON b.id = s.branch_id",
      "LEFT JOIN inventory_variant_snapshots AS v ON v.variant_id = s.variant_id",
      "WHERE r.id = $1",
    ].join("\n"), [id]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.reservation_id,
      orderId: row.order_id,
      stock: this.toStock(row),
      quantity: row.quantity,
      status: row.status,
      expiresAt: this.toIso(row.expires_at),
      committedAt: row.committed_at ? this.toIso(row.committed_at) : null,
      releasedAt: row.released_at ? this.toIso(row.released_at) : null,
    };
  }

  private async insertMovement(
    client: PoolClient,
    stockId: string,
    type: "RESERVATION_COMMIT" | "RESERVATION_RELEASE" | "RESERVATION_EXPIRE" | "ORDER_CANCELLATION_RESTOCK",
    quantity: number,
    onHandDelta: number,
    reservedDelta: number,
    reason: string,
    actorId: string | null,
    actorRole: Role | null,
    correlationId: string | null,
  ): Promise<void> {
    await client.query([
      "INSERT INTO inventory_movements (",
      "  stock_id, type, quantity, on_hand_delta, reserved_delta,",
      "  reason, actor_id, actor_role, correlation_id",
      ") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    ].join("\n"), [
      stockId,
      type,
      quantity,
      onHandDelta,
      reservedDelta,
      reason,
      actorId,
      actorRole,
      correlationId,
    ]);
  }

  private async insertAudit(
    client: PoolClient,
    actorId: string | null,
    actorRole: Role | null,
    action: string,
    stockId: string,
    correlationId: string | null,
  ): Promise<void> {
    await client.query([
      "INSERT INTO inventory_audit_log (",
      "  actor_id, actor_role, action, stock_id, correlation_id, result",
      ") VALUES ($1, $2, $3, $4, $5, 'SUCCEEDED')",
    ].join("\n"), [actorId, actorRole, action, stockId, correlationId]);
  }

  private async enqueueStockEvents(
    client: PoolClient,
    stock: InventoryStock,
    correlationId: string | null,
  ): Promise<void> {
    const data = {
      variantId: stock.variantId,
      branchId: stock.branch.id,
      branchName: stock.branch.name,
      onHand: stock.onHand,
      reserved: stock.reserved,
      available: stock.available,
      reorderPoint: stock.reorderPoint,
      lastUpdatedAt: stock.lastUpdatedAt,
    };
    await this.outbox.enqueue(client, {
      eventType: "inventory.stock.changed.v1",
      correlationId,
      data,
    });
    if (stock.reorderPoint !== null && stock.available <= stock.reorderPoint) {
      await this.outbox.enqueue(client, {
        eventType: "inventory.low-stock.v1",
        correlationId,
        data,
      });
    }
  }

  private cancellationItems(event: OrderCancelledEvent): Array<{
    variantId: string;
    branchId: string;
    quantity: number;
  }> {
    if (!this.isUuid(event.eventId) || !this.isUuid(String(event.data.orderId ?? ""))) {
      throw new Error("Order cancellation event identifiers are invalid.");
    }
    const source = event.data.items;
    if (!Array.isArray(source) || source.length === 0 || source.length > 20) {
      throw new Error("Order cancellation event items are invalid.");
    }
    const grouped = new Map<string, { variantId: string; branchId: string; quantity: number }>();
    for (const item of source) {
      if (typeof item !== "object" || item === null) throw new Error("Order cancellation item is invalid.");
      const value = item as Record<string, unknown>;
      const variantId = typeof value.variantId === "string" ? value.variantId : "";
      const branchId = typeof value.branchId === "string" ? value.branchId : "";
      const quantity = value.quantity;
      if (
        !this.isUuid(variantId)
        || !this.isUuid(branchId)
        || typeof quantity !== "number"
        || !Number.isSafeInteger(quantity)
        || quantity < 1
      ) {
        throw new Error("Order cancellation item is invalid.");
      }
      const key = branchId + ":" + variantId;
      const previous = grouped.get(key)?.quantity ?? 0;
      if (previous + quantity > 1_000_000) throw new Error("Order cancellation quantity is invalid.");
      grouped.set(key, { variantId, branchId, quantity: previous + quantity });
    }
    return [...grouped.values()].sort((left, right) =>
      (left.branchId + left.variantId).localeCompare(right.branchId + right.variantId),
    );
  }

  private stockSelect(suffix: string): string {
    return [
      "SELECT s.id, s.variant_id, s.branch_id, b.name AS branch_name,",
      "  v.product_name, v.sku, v.variant_label,",
      "  s.on_hand, s.reserved, s.reorder_point, s.updated_at",
      "FROM inventory_stock AS s",
      "JOIN inventory_branches AS b ON b.id = s.branch_id",
      "LEFT JOIN inventory_variant_snapshots AS v ON v.variant_id = s.variant_id",
      suffix,
    ].join("\n");
  }

  private toStock(row: StockRow): InventoryStock {
    const snapshot: VariantSnapshot = {
      productName: row.product_name ?? "Producto pendiente de sincronizar",
      sku: row.sku ?? "SKU pendiente",
      variantLabel: row.variant_label ?? "Variante pendiente de sincronizar",
    };
    return {
      id: row.id,
      variantId: row.variant_id,
      branch: {
        id: row.branch_id,
        name: row.branch_name,
      },
      product: snapshot,
      onHand: row.on_hand,
      reserved: row.reserved,
      available: row.on_hand - row.reserved,
      reorderPoint: row.reorder_point,
      lastUpdatedAt: this.toIso(row.updated_at),
    };
  }

  private onHandDelta(type: MovementType, quantity: number): number {
    switch (type) {
      case "RECEIPT":
      case "ADJUSTMENT_IN":
        return quantity;
      case "ADJUSTMENT_OUT":
      case "PHYSICAL_SALE":
        return -quantity;
    }
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new ApiException(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key es obligatorio y debe tener como máximo 200 caracteres",
      );
    }
    return key;
  }

  private async lockIdempotencyKey(client: PoolClient, key: string): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "orders-service:" + key,
    ]);
  }

  private requiredIdentifier(row: IdentifierRow | undefined, message: string): string {
    if (!row?.id) {
      throw new Error(message);
    }
    return row.id;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  private toIso(value: Date | string): string {
    return this.toDate(value).toISOString();
  }
}
