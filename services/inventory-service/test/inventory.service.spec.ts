import type { ExecutionContext } from "@nestjs/common";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { ApiException } from "../src/common/api-exception";
import type { AuthenticatedRequest } from "../src/common/authenticated-request";
import { InternalOrdersGuard } from "../src/common/internal-orders.guard";
import type { InventoryRuntimeConfig } from "../src/config/environment";
import { DatabaseService } from "../src/database/database.service";
import { InventoryService } from "../src/inventory/inventory.service";

const stock = {
  id: "c1000000-0000-4000-8000-000000000001",
  variant_id: "a2000000-0000-4000-8000-000000000001",
  branch_id: "b1000000-0000-4000-8000-000000000001",
  branch_name: "Sucursal Centro",
  product_name: "Smart TV Aurora 55",
  sku: "AUR-55-4K",
  variant_label: "55 pulgadas",
  on_hand: 1,
  reserved: 0,
  reorder_point: 1,
  updated_at: new Date("2026-09-01T12:00:00.000Z"),
};

type StoredReservation = {
  id: string;
  orderId: string;
  quantity: number;
  status: "RESERVED";
  expiresAt: Date;
};

function reservationRow(reservation: StoredReservation) {
  return {
    ...stock,
    reservation_id: reservation.id,
    order_id: reservation.orderId,
    quantity: reservation.quantity,
    status: reservation.status,
    expires_at: reservation.expiresAt,
    committed_at: null,
    released_at: null,
  };
}

function createInventoryHarness(): {
  service: InventoryService;
  reserved: () => number;
} {
  let currentReserved = 0;
  let sequence = 0;
  const reservations = new Map<string, StoredReservation>();
  const keys = new Map<string, string>();

  const query = async (statement: string, values: unknown[] = []) => {
    if (statement.includes("pg_advisory_xact_lock")) {
      return { rows: [] };
    }
    if (statement.startsWith("SELECT id FROM inventory_reservations")) {
      const key = values[0];
      const id = typeof key === "string" ? keys.get(key) : undefined;
      return { rows: id ? [{ id }] : [] };
    }
    if (statement.startsWith("SELECT id, stock_id, quantity")) {
      return { rows: [] };
    }
    if (statement.startsWith("UPDATE inventory_stock AS s")) {
      const quantity = values[0];
      if (typeof quantity !== "number" || stock.on_hand - currentReserved < quantity) {
        return { rows: [] };
      }
      currentReserved += quantity;
      return { rows: [{ ...stock, reserved: currentReserved }] };
    }
    if (statement.includes("INSERT INTO inventory_reservations")) {
      const id = "d1000000-0000-4000-8000-00000000000" + (++sequence);
      const key = values[5];
      const quantity = values[6];
      const expiresAt = values[7];
      if (
        typeof key !== "string"
        || typeof quantity !== "number"
        || !(expiresAt instanceof Date)
      ) {
        throw new Error("Unexpected reservation values.");
      }
      reservations.set(id, {
        id,
        orderId: String(values[3]),
        quantity,
        status: "RESERVED",
        expiresAt,
      });
      keys.set(key, id);
      return { rows: [{ id }] };
    }
    if (statement.startsWith("INSERT INTO inventory_audit_log")) {
      return { rows: [] };
    }
    if (statement.startsWith("SELECT r.id AS reservation_id")) {
      const id = values[0];
      const reservation = typeof id === "string" ? reservations.get(id) : undefined;
      return { rows: reservation ? [reservationRow(reservation)] : [] };
    }
    throw new Error("Unhandled query: " + statement);
  };

  const client = { query } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(operation: (transaction: PoolClient) => Promise<T>) => operation(client),
  } as unknown as DatabaseService;
  const service = new InventoryService(
    database,
    { enqueue: vi.fn() } as never,
    { reservationTtlSeconds: 900 },
  );
  return { service, reserved: () => currentReserved };
}

describe("InventoryService reservations", () => {
  it("confirma exactamente una reserva cuando dos solicitudes compiten por la última unidad", async () => {
    const harness = createInventoryHarness();
    const body = {
      variantId: stock.variant_id,
      branchId: stock.branch_id,
      orderId: "e1000000-0000-4000-8000-000000000001",
      quantity: 1,
    };
    const [first, second] = await Promise.allSettled([
      harness.service.reserve(body, "last-unit-first", "test-correlation"),
      harness.service.reserve(
        { ...body, orderId: "e1000000-0000-4000-8000-000000000002" },
        "last-unit-second",
        "test-correlation",
      ),
    ]);

    const succeeded = [first, second].filter((result) => result.status === "fulfilled");
    const failed = [first, second].filter((result) => result.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(harness.reserved()).toBe(1);
    const reason = (failed[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(ApiException);
    expect((reason as ApiException).code).toBe("OUT_OF_STOCK");
  });

  it("devuelve la reserva anterior con la misma Idempotency-Key y no duplica stock reservado", async () => {
    const harness = createInventoryHarness();
    const body = {
      variantId: stock.variant_id,
      branchId: stock.branch_id,
      orderId: "e1000000-0000-4000-8000-000000000001",
      quantity: 1,
    };
    const first = await harness.service.reserve(body, "same-request", "test-correlation");
    const retried = await harness.service.reserve(body, "same-request", "test-correlation");

    expect(retried).toEqual(first);
    expect(harness.reserved()).toBe(1);
  });

  it("persiste la liberación de una reserva vencida antes de responder conflicto", async () => {
    let released = false;
    const expiredReservationId = "d1000000-0000-4000-8000-000000000001";
    const query = async (statement: string) => {
      if (statement.includes("pg_advisory_xact_lock")) {
        return { rows: [] };
      }
      if (statement.startsWith("SELECT reservation_id AS id")) {
        return { rows: [] };
      }
      if (statement.startsWith("SELECT id, stock_id, quantity, status, expires_at")) {
        return {
          rows: [{
            id: expiredReservationId,
            stock_id: stock.id,
            quantity: 1,
            status: "RESERVED",
            expires_at: new Date("2026-01-01T00:00:00.000Z"),
          }],
        };
      }
      if (statement.startsWith("UPDATE inventory_stock") && statement.includes("SET reserved")) {
        released = true;
        return { rows: [{ id: stock.id }] };
      }
      if (
        statement.startsWith("UPDATE inventory_reservations")
        || statement.startsWith("INSERT INTO inventory_movements")
        || statement.startsWith("INSERT INTO inventory_audit_log")
      ) {
        return { rows: [] };
      }
      if (statement.startsWith("SELECT s.id, s.variant_id")) {
        return { rows: [stock] };
      }
      throw new Error("Unhandled expiration query: " + statement);
    };
    const client = { query } as unknown as PoolClient;
    const database = {
      withTransaction: async <T>(operation: (transaction: PoolClient) => Promise<T>) => operation(client),
    } as unknown as DatabaseService;
    const service = new InventoryService(
      database,
      { enqueue: vi.fn() } as never,
      { reservationTtlSeconds: 900 },
    );

    await expect(
      service.commitReservation(expiredReservationId, "expired-reservation", "test-correlation"),
    ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
    expect(released).toBe(true);
  });
});

describe("InternalOrdersGuard", () => {
  it("acepta solo la llave privada configurada para reservas de Orders", () => {
    const configured = Buffer.from("a".repeat(43), "utf8");
    const guard = new InternalOrdersGuard({
      internalServiceSecret: configured,
    } as Pick<InventoryRuntimeConfig, "internalServiceSecret">);
    const request = {
      header: (name: string) => name === "x-internal-service-key" ? "a".repeat(43) : undefined,
    } as unknown as AuthenticatedRequest;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
