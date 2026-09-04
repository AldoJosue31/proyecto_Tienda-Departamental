import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("arquitectura de la fase 5", () => {
  it("aísla Orders en PostgreSQL propio y lo conecta a servicios solo por red interna", () => {
    const compose = read("compose.yaml");
    const kong = read("infra/kong/kong.yml.template");
    const database = compose.slice(
      compose.indexOf("\n  orders-postgres:"),
      compose.indexOf("\n  postgres:"),
    );
    const service = compose.slice(
      compose.indexOf("\n  orders-service:"),
      compose.indexOf("\n  orders-postgres:"),
    );

    expect(compose).toContain("orders-service:");
    expect(compose).toContain("orders-postgres:");
    expect(compose).toContain("orders-internal:");
    expect(compose).toContain("orders_postgres_data:");
    expect(database).not.toContain("ports:");
    expect(service).toContain("CATALOG_SERVICE_URL");
    expect(service).toContain("PRICING_SERVICE_URL");
    expect(service).toContain("INVENTORY_SERVICE_URL");
    expect(kong).toContain("url: http://orders-service:3005");
  });

  it("publica solo los contratos de Orders con JWT y delega la propiedad al servicio", () => {
    const kong = read("infra/kong/kong.yml.template");
    const controller = read("services/orders-service/src/orders/orders.controller.ts");

    expect(kong).toContain("name: orders-create-list");
    expect(kong).toContain("name: orders-detail");
    expect(kong).toContain("name: orders-cancel");
    expect(controller).toContain('@Roles("ADMIN", "EMPLOYEE", "CUSTOMER")');
    expect(controller).toContain('@Roles("ADMIN", "EMPLOYEE")');
    expect(controller).toContain('@Post(":id/cancel")');
  });

  it("guarda snapshots de precio, usa reserva interna y no cruza FKs entre bases", () => {
    const service = read("services/orders-service/src/orders/orders.service.ts");
    const migration = read("services/orders-service/migrations/001_orders_schema.sql");

    expect(service).toContain("this.catalog.getVariant");
    expect(service).toContain("this.pricing.quote");
    expect(service).toContain("this.inventory.reserve");
    expect(service).toContain("this.inventory.commit");
    expect(service).toContain("IDEMPOTENCY_KEY_REQUIRED");
    expect(migration).toContain("list_unit_price");
    expect(migration).toContain("unit_price");
    expect(migration).not.toMatch(/REFERENCES\s+(catalog|inventory|pricing)_/i);
  });

  it("retira el checkout local heredado", () => {
    expect(existsSync(path.join(webRoot, "src/app/api/checkouts/route.ts"))).toBe(false);
    expect(existsSync(path.join(webRoot, "src/lib/server/checkout-service.ts"))).toBe(false);
  });
});
