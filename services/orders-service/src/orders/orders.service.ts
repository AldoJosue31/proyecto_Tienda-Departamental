import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import { ApiException } from "../common/api-exception";
import { CatalogClient } from "./catalog.client";
import { InventoryClient } from "./inventory.client";
import { OrdersOutboxService } from "../events/outbox.service";
import { type CreateOrderDto } from "./orders.dto";
import { OrdersRepository } from "./orders.repository";
import type {
  CreateOrderSnapshot,
  Order,
  OrderActor,
  OrderResponse,
  StoredOrder,
} from "./orders.types";
import { PricingClient } from "./pricing.client";
import { DatabaseService } from "../database/database.service";

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

interface RequestedItem {
  productId: string;
  variantId: string;
  quantity: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: OrdersRepository,
    private readonly catalog: CatalogClient,
    private readonly pricing: PricingClient,
    private readonly inventory: InventoryClient,
    private readonly outbox: OrdersOutboxService,
  ) {}

  async create(
    body: CreateOrderDto,
    idempotencyKey: string | undefined,
    actor: OrderActor,
  ): Promise<OrderResponse> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const customerId = actor.role === "CUSTOMER" ? actor.id : body.customerId ?? actor.id;
    const requestedItems = this.mergeRequestedItems(body);
    const requestHash = this.requestHash(customerId, body.branchId, requestedItems);
    const lock = "orders:create:" + actor.id + ":" + key;

    return this.database.withAdvisoryLock(lock, async (client) => {
      const prior = await this.repository.findIdempotency(client, actor.id, key);
      let order: StoredOrder;
      if (prior) {
        if (prior.requestHash !== requestHash) {
          throw new ApiException(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "La misma Idempotency-Key no puede usarse con un pedido diferente",
          );
        }
        if (prior.outcomeCode) {
          throw this.previousFailure(prior.outcomeCode, prior.outcomeMessage);
        }
        const replayedOrder = await this.repository.findByIdForClient(client, prior.orderId);
        if (!replayedOrder) throw new Error("Idempotency record points to a missing order.");
        order = replayedOrder;
      } else {
        order = await this.database.withTransactionOnClient(client, (transaction) =>
          this.repository.createDraft(transaction, {
            customerId,
            branchId: body.branchId,
            actor,
            idempotencyKey: key,
            requestHash,
          }),
        );
      }

      if (order.status === "CONFIRMED" || order.status === "CANCELLED") {
        return { order: this.publicOrder(order) };
      }
      return this.completeCheckout(client, order, requestedItems, actor, key);
    });
  }

  async list(actor: OrderActor): Promise<{ orders: Order[] }> {
    if (actor.role === "CUSTOMER") {
      throw new ApiException(403, "FORBIDDEN", "No tienes permisos para consultar todas las órdenes");
    }
    const orders = await this.repository.listOperations();
    return { orders: orders.map((order) => this.publicOrder(order)) };
  }

  async get(orderId: string, actor: OrderActor): Promise<OrderResponse> {
    const order = await this.findAuthorizedOrder(orderId, actor);
    return { order: this.publicOrder(order) };
  }

  async cancel(orderId: string, actor: OrderActor, reason: string | null): Promise<OrderResponse> {
    const normalizedId = this.requireUuid(orderId);
    return this.database.withAdvisoryLock("orders:cancel:" + normalizedId, async (client) => {
      const existing = await this.repository.findByIdForClient(client, normalizedId);
      if (!existing) throw new ApiException(404, "ORDER_NOT_FOUND", "Pedido no encontrado");
      this.assertOwner(existing, actor);
      if (existing.status === "CANCELLED") return { order: this.publicOrder(existing) };

      // Only non-consumed reservations can be returned synchronously. A
      // confirmed cancellation is compensated asynchronously by Inventory
      // after the transactional order.cancelled.v1 Outbox event is published.
      if (existing.status === "PENDING" || existing.status === "RESERVED") {
        await this.releaseReservations(existing, "cancel", actor.correlationId);
      }
      const cancelled = await this.database.withTransactionOnClient(client, async (transaction) => {
        const locked = await this.repository.findByIdForClient(transaction, normalizedId, true);
        if (!locked) throw new ApiException(404, "ORDER_NOT_FOUND", "Pedido no encontrado");
        this.assertOwner(locked, actor);
        if (locked.status !== "CANCELLED") {
          await this.repository.cancel(transaction, normalizedId, actor, reason);
          if (locked.status === "CONFIRMED") {
            await this.outbox.enqueue(transaction, {
              eventType: "order.cancelled.v1",
              correlationId: actor.correlationId,
              data: {
                ...this.eventData(locked),
                status: "CANCELLED",
                cancellationReason: reason,
                cancelledBy: { id: actor.id, role: actor.role },
              },
            });
          }
        }
        const result = await this.repository.findByIdForClient(transaction, normalizedId);
        if (!result) throw new Error("Cancelled order is missing.");
        return result;
      });
      return { order: this.publicOrder(cancelled) };
    });
  }

  private async completeCheckout(
    client: PoolClient,
    order: StoredOrder,
    requestedItems: RequestedItem[],
    actor: OrderActor,
    idempotencyKey: string,
  ): Promise<OrderResponse> {
    let current = order;
    if (current.items.length === 0) {
      const snapshots = await this.createSnapshots(current.id, current.branchId, requestedItems, actor.correlationId);
      await this.database.withTransactionOnClient(client, async (transaction) => {
        await this.repository.replaceItems(transaction, current.id, snapshots);
        await this.repository.audit(transaction, current.id, actor, "ORDER_PRICE_SNAPSHOTTED");
      });
      const refreshed = await this.repository.findByIdForClient(client, current.id);
      if (!refreshed) throw new Error("Order is missing after pricing snapshot.");
      current = refreshed;
    }

    try {
      for (const item of current.items) {
        if (item.reservationId) continue;
        const reservation = await this.inventory.reserve({
          variantId: item.variantId,
          branchId: item.branchId,
          orderId: current.id,
          quantity: item.quantity,
          idempotencyKey: this.inventoryKey(idempotencyKey, "reserve", item.variantId),
          correlationId: actor.correlationId,
        });
        await this.database.withTransactionOnClient(client, (transaction) =>
          this.repository.assignReservation(transaction, current.id, item.variantId, reservation.id),
        );
      }
      current = await this.requireOrder(client, current.id);
      if (current.status === "PENDING") {
        await this.database.withTransactionOnClient(client, async (transaction) => {
          await this.repository.setStatus(transaction, current.id, "RESERVED");
          await this.repository.audit(transaction, current.id, actor, "ORDER_INVENTORY_RESERVED");
        });
        current = await this.requireOrder(client, current.id);
      }

      for (const item of current.items) {
        if (!item.reservationId) throw new Error("Order item has no inventory reservation.");
        await this.inventory.commit(
          item.reservationId,
          this.inventoryKey(idempotencyKey, "commit", item.reservationId),
          actor.correlationId,
        );
      }
      await this.database.withTransactionOnClient(client, async (transaction) => {
        await this.repository.setStatus(transaction, current.id, "CONFIRMED");
        await this.repository.audit(transaction, current.id, actor, "ORDER_CONFIRMED");
        const data = this.eventData({ ...current, status: "CONFIRMED" });
        await this.outbox.enqueue(transaction, {
          eventType: "order.created.v1",
          correlationId: actor.correlationId,
          data,
        });
        await this.outbox.enqueue(transaction, {
          eventType: "order.completed.v1",
          correlationId: actor.correlationId,
          data,
        });
      });
      return { order: this.publicOrder(await this.requireOrder(client, current.id)) };
    } catch (error) {
      if (error instanceof ApiException && error.code === "OUT_OF_STOCK") {
        await this.releaseReservations(await this.requireOrder(client, current.id), "rollback", actor.correlationId);
        await this.database.withTransactionOnClient(client, (transaction) =>
          this.repository.failOutOfStock(
            transaction,
            current.id,
            actor,
            error.code,
            "Una o más líneas ya no tienen existencias suficientes",
          ),
        );
      }
      throw error;
    }
  }

  private async createSnapshots(
    orderId: string,
    branchId: string,
    requestedItems: RequestedItem[],
    correlationId: string | null,
  ): Promise<CreateOrderSnapshot[]> {
    const snapshots: CreateOrderSnapshot[] = [];
    let currency: string | null = null;
    for (const requested of requestedItems) {
      const catalog = await this.catalog.getVariant(
        requested.productId,
        requested.variantId,
        correlationId,
      );
      const quote = await this.pricing.quote({
        variantId: catalog.variantId,
        productId: catalog.productId,
        categoryId: catalog.categoryId,
        basePrice: catalog.listPrice,
        currency: catalog.currency,
        correlationId,
      });
      if (currency && currency !== quote.currency) {
        throw new ApiException(409, "MIXED_CURRENCY_ORDER", "Todas las líneas del pedido deben usar la misma moneda");
      }
      currency = quote.currency;
      const listUnitPrice = this.money(quote.basePrice);
      const unitPrice = this.money(quote.effectivePrice);
      snapshots.push({
        productId: catalog.productId,
        categoryId: catalog.categoryId,
        variantId: catalog.variantId,
        branchId,
        productName: catalog.productName,
        sku: catalog.sku,
        variantLabel: catalog.variantLabel,
        quantity: requested.quantity,
        listUnitPrice,
        unitPrice,
        lineDiscountTotal: this.money((listUnitPrice - unitPrice) * requested.quantity),
        lineTotal: this.money(unitPrice * requested.quantity),
        currency: quote.currency,
      });
    }
    if (snapshots.length === 0) throw new Error("Order requires at least one item.");
    // The parameter proves snapshots are tied to a durable order ID before a
    // reservation is attempted; it is intentionally not sent to Catalog/Pricing.
    if (!this.isUuid(orderId)) throw new Error("Order identifier is invalid.");
    return snapshots;
  }

  private async releaseReservations(
    order: StoredOrder,
    purpose: "cancel" | "rollback",
    correlationId: string | null,
  ): Promise<void> {
    for (const item of order.items) {
      if (!item.reservationId) continue;
      try {
        await this.inventory.release(
          item.reservationId,
          "order:" + order.id + ":" + purpose + ":" + item.reservationId,
          correlationId,
        );
      } catch {
        // Inventory TTL is a second safety net. The current checkout error is
        // retained instead of replacing it with a best-effort release failure.
      }
    }
  }

  private async findAuthorizedOrder(orderId: string, actor: OrderActor): Promise<StoredOrder> {
    const normalizedId = this.requireUuid(orderId);
    const order = await this.repository.findById(normalizedId);
    if (!order) throw new ApiException(404, "ORDER_NOT_FOUND", "Pedido no encontrado");
    this.assertOwner(order, actor);
    return order;
  }

  private assertOwner(order: StoredOrder, actor: OrderActor): void {
    if (actor.role === "CUSTOMER" && order.customerId !== actor.id) {
      throw new ApiException(403, "FORBIDDEN", "No puedes consultar ni modificar este pedido");
    }
  }

  private async requireOrder(client: PoolClient, orderId: string): Promise<StoredOrder> {
    const order = await this.repository.findByIdForClient(client, orderId);
    if (!order) throw new Error("Order is missing.");
    return order;
  }

  private mergeRequestedItems(body: CreateOrderDto): RequestedItem[] {
    const grouped = new Map<string, RequestedItem>();
    for (const item of body.items) {
      const key = item.productId + ":" + item.variantId;
      const previous = grouped.get(key);
      const quantity = (previous?.quantity ?? 0) + item.quantity;
      if (quantity > 1_000_000) {
        throw new ApiException(400, "VALIDATION_ERROR", "La cantidad agregada supera el máximo permitido");
      }
      grouped.set(key, { productId: item.productId, variantId: item.variantId, quantity });
    }
    return [...grouped.values()].sort((left, right) =>
      (left.productId + left.variantId).localeCompare(right.productId + right.variantId),
    );
  }

  private requestHash(customerId: string, branchId: string, items: RequestedItem[]): string {
    return createHash("sha256").update(JSON.stringify({ customerId, branchId, items })).digest("hex");
  }

  private previousFailure(code: string, message: string | null): ApiException {
    if (code === "OUT_OF_STOCK") {
      return new ApiException(409, code, message ?? "Una o más líneas ya no tienen existencias suficientes");
    }
    return new ApiException(409, code, message ?? "El pedido no se puede completar");
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) {
      throw new ApiException(400, "IDEMPOTENCY_KEY_REQUIRED", "El encabezado Idempotency-Key es obligatorio");
    }
    if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(key)) {
      throw new ApiException(400, "INVALID_IDEMPOTENCY_KEY", "La Idempotency-Key no tiene un formato válido");
    }
    return key;
  }

  private requireUuid(value: string): string {
    const id = value.trim();
    if (!this.isUuid(id)) throw new ApiException(404, "ORDER_NOT_FOUND", "Pedido no encontrado");
    return id;
  }

  private inventoryKey(idempotencyKey: string, operation: string, identifier: string): string {
    // Inventory limits keys to 200 characters. Deriving a fixed-size value
    // preserves the caller's idempotency semantics even for a 200-char key.
    return "orders:" + createHash("sha256")
      .update(idempotencyKey + ":" + operation + ":" + identifier)
      .digest("hex");
  }

  private publicOrder(order: StoredOrder): Order {
    return {
      id: order.id,
      branchId: order.branchId,
      status: order.status,
      currency: order.currency,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      total: order.total,
      cancellationReason: order.cancellationReason,
      cancelledAt: order.cancelledAt,
      version: order.version,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items,
    };
  }

  private eventData(order: StoredOrder): Record<string, unknown> {
    return {
      orderId: order.id,
      customerId: order.customerId,
      branchId: order.branchId,
      status: order.status,
      currency: order.currency,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      total: order.total,
      items: order.items.map((item) => ({
        productId: item.productId,
        categoryId: item.categoryId,
        variantId: item.variantId,
        branchId: item.branchId,
        productName: item.productName,
        sku: item.sku,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
    };
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
