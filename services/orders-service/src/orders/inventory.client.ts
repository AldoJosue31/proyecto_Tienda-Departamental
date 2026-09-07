import { Inject, Injectable } from "@nestjs/common";

import { ORDERS_RUNTIME_CONFIG } from "../auth/token.service";
import { ApiException } from "../common/api-exception";
import type { OrdersRuntimeConfig } from "../config/environment";

export interface InventoryReservation {
  id: string;
  status: "RESERVED" | "COMMITTED" | "RELEASED" | "EXPIRED";
}

@Injectable()
export class InventoryClient {
  constructor(
    @Inject(ORDERS_RUNTIME_CONFIG)
    private readonly config: Pick<
      OrdersRuntimeConfig,
      "inventoryServiceUrl" | "inventoryInternalServiceKey" | "upstreamTimeoutMilliseconds"
    >,
  ) {}

  reserve(input: {
    variantId: string;
    branchId: string;
    orderId: string;
    quantity: number;
    idempotencyKey: string;
    correlationId: string | null;
  }): Promise<InventoryReservation> {
    // The Inventory reservation contract is intentionally narrow. Transport
    // metadata belongs in headers, never in its validated DTO body.
    return this.request(
      "/inventory/reservations",
      "POST",
      {
        variantId: input.variantId,
        branchId: input.branchId,
        orderId: input.orderId,
        quantity: input.quantity,
      },
      input.idempotencyKey,
      input.correlationId,
    );
  }

  commit(reservationId: string, idempotencyKey: string, correlationId: string | null): Promise<InventoryReservation> {
    return this.request(
      "/inventory/reservations/" + encodeURIComponent(reservationId) + "/commit",
      "POST",
      undefined,
      idempotencyKey,
      correlationId,
    );
  }

  release(reservationId: string, idempotencyKey: string, correlationId: string | null): Promise<InventoryReservation> {
    return this.request(
      "/inventory/reservations/" + encodeURIComponent(reservationId) + "/release",
      "POST",
      undefined,
      idempotencyKey,
      correlationId,
    );
  }

  private async request(
    path: string,
    method: "POST",
    body: unknown,
    idempotencyKey: string,
    correlationId: string | null,
  ): Promise<InventoryReservation> {
    const url = new URL(path, this.config.inventoryServiceUrl);
    const headers: Record<string, string> = {
      "x-internal-service-key": this.config.inventoryInternalServiceKey,
      "idempotency-key": idempotencyKey,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (correlationId) headers["x-correlation-id"] = correlationId;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.upstreamTimeoutMilliseconds),
      });
    } catch {
      throw new ApiException(503, "INVENTORY_UNAVAILABLE", "Inventario no está disponible para confirmar el pedido");
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 409 && this.object(payload) && payload.code === "OUT_OF_STOCK") {
        throw new ApiException(409, "OUT_OF_STOCK", "Una o más líneas ya no tienen existencias suficientes");
      }
      if (response.status === 409 && this.object(payload) && payload.code === "RESERVATION_EXPIRED") {
        throw new ApiException(409, "RESERVATION_EXPIRED", "La reserva venció antes de confirmar el pedido");
      }
      throw new ApiException(503, "INVENTORY_UNAVAILABLE", "Inventario no está disponible para confirmar el pedido");
    }
    if (
      !this.object(payload)
      || !this.object(payload.reservation)
      || typeof payload.reservation.id !== "string"
      || !["RESERVED", "COMMITTED", "RELEASED", "EXPIRED"].includes(String(payload.reservation.status))
    ) {
      throw new ApiException(503, "INVENTORY_UNAVAILABLE", "Inventario devolvió una respuesta inválida");
    }
    return {
      id: payload.reservation.id,
      status: payload.reservation.status as InventoryReservation["status"],
    };
  }

  private object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
