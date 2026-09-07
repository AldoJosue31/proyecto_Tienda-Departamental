import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { ApiException } from "../src/common/api-exception";
import { DatabaseService } from "../src/database/database.service";
import { PricingService } from "../src/pricing/pricing.service";

const basePromotion = {
  id: "c1000000-0000-4000-8000-000000000001",
  name: "Venta Nocturna",
  status: "ACTIVE" as const,
  discount_type: "PERCENTAGE" as const,
  discount_value: 10,
  priority: 10,
  starts_at: new Date("2026-01-01T00:00:00.000Z"),
  ends_at: new Date("2026-12-31T00:00:00.000Z"),
  timezone: "America/Mexico_City",
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
};

describe("PricingService quote", () => {
  it("aplica una sola promoción por prioridad y nunca modifica el precio base", async () => {
    const database = {
      query: async () => ({
        rows: [
          { ...basePromotion, priority: 5, discount_value: 50 },
          basePromotion,
        ],
      }),
    } as unknown as DatabaseService;
    const service = new PricingService(database, { enqueue: vi.fn() } as never, {
      schedulerIntervalSeconds: 30,
      environment: "test",
    });

    const quote = await service.quote({
      variantId: "a2000000-0000-4000-8000-000000000001",
      basePrice: 1000,
      currency: "MXN",
    });

    expect(quote.basePrice).toBe(1000);
    expect(quote.effectivePrice).toBe(900);
    expect(quote.discountAmount).toBe(100);
    expect(quote.appliedPromotion?.id).toBe(basePromotion.id);
  });

  it("rechaza porcentajes superiores a 100 antes de escribir en la base", async () => {
    const database = {} as DatabaseService;
    const service = new PricingService(database, { enqueue: vi.fn() } as never, {
      schedulerIntervalSeconds: 30,
      environment: "test",
    });

    await expect(service.createPromotion({
      name: "Descuento inválido",
      discountType: "PERCENTAGE",
      discountValue: 101,
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-02T00:00:00.000Z",
      timezone: "America/Mexico_City",
      targets: [{ scope: "ALL" }],
    }, {
      id: "f1000000-0000-4000-8000-000000000001",
      role: "ADMIN",
      correlationId: "test",
    })).rejects.toMatchObject({ code: "INVALID_DISCOUNT" } satisfies Partial<ApiException>);
  });
});

describe("PricingService scheduler", () => {
  it("activa y expira transiciones de forma idempotente", async () => {
    const queries: string[] = [];
    const outbox = { enqueue: vi.fn() };
    const client = {
      query: async (statement: string) => {
        queries.push(statement);
        if (statement.includes("SET status = 'EXPIRED'")) return { rows: [{ id: "expired" }] };
        if (statement.includes("SET status = 'ACTIVE'")) return { rows: [{ id: "active" }] };
        if (statement.includes("FROM pricing_promotions WHERE id")) return { rows: [basePromotion] };
        return { rows: [] };
      },
    } as unknown as PoolClient;
    const database = {
      withTransaction: async <T>(operation: (transaction: PoolClient) => Promise<T>) => operation(client),
    } as unknown as DatabaseService;
    const service = new PricingService(database, outbox as never, {
      schedulerIntervalSeconds: 30,
      environment: "test",
    });

    await expect(service.reconcilePromotionStates(new Date("2026-09-02T00:00:00.000Z")))
      .resolves.toEqual({ activated: 1, expired: 1 });
    expect(queries.filter((query) => query.includes("INSERT INTO pricing_audit_log"))).toHaveLength(2);
    expect(outbox.enqueue).toHaveBeenCalledTimes(2);
    expect(outbox.enqueue).toHaveBeenNthCalledWith(
      1,
      client,
      expect.objectContaining({ eventType: "promotion.expired.v1" }),
    );
    expect(outbox.enqueue).toHaveBeenNthCalledWith(
      2,
      client,
      expect.objectContaining({ eventType: "promotion.activated.v1" }),
    );
  });
});

describe("PricingService deletion audit", () => {
  it("audita antes de borrar para conservar el evento con ON DELETE SET NULL", async () => {
    const queries: string[] = [];
    const client = {
      query: async (statement: string) => {
        queries.push(statement);
        if (statement.includes("SELECT id FROM pricing_promotions")) {
          return { rows: [{ id: basePromotion.id }] };
        }
        return { rows: [] };
      },
    } as unknown as PoolClient;
    const database = {
      withTransaction: async <T>(operation: (transaction: PoolClient) => Promise<T>) => operation(client),
    } as unknown as DatabaseService;
    const service = new PricingService(database, { enqueue: vi.fn() } as never, {
      schedulerIntervalSeconds: 30,
      environment: "test",
    });

    await service.deletePromotion(basePromotion.id, {
      id: "f1000000-0000-4000-8000-000000000001",
      role: "ADMIN",
      correlationId: "test",
    });

    const auditIndex = queries.findIndex((query) => query.includes("INSERT INTO pricing_audit_log"));
    const deleteIndex = queries.findIndex((query) => query.includes("DELETE FROM pricing_promotions"));
    expect(auditIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(auditIndex);
  });
});
