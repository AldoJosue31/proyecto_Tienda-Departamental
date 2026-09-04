import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("arquitectura de la fase 3", () => {
  it("aísla Inventory en PostgreSQL propio detrás de Kong", () => {
    const compose = read("compose.yaml");
    const kong = read("infra/kong/kong.yml.template");

    expect(compose).toContain("inventory-service:");
    expect(compose).toContain("inventory-postgres:");
    expect(compose).toContain("inventory-internal:");
    expect(compose).toContain("inventory_postgres_data:");
    expect(compose).not.toMatch(/inventory-service:[\s\S]{0,900}\n\s+ports:/);
    const inventoryPostgres = compose.slice(
      compose.indexOf("inventory-postgres:"),
      compose.indexOf("\n  postgres:"),
    );
    expect(inventoryPostgres).not.toContain("ports:");
    expect(kong).toContain("url: http://inventory-service:3003");
    expect(kong).toContain("name: inventory-read");
    expect(kong).toContain("name: inventory-create-movement");
  });

  it("mantiene reservas como contrato interno de Orders y protege lecturas por rol", () => {
    const kong = read("infra/kong/kong.yml.template");
    const controller = read("services/inventory-service/src/inventory/inventory.controller.ts");

    expect(kong).not.toContain("name: inventory-reservations");
    expect(controller).toContain("InternalOrdersGuard");
    expect(controller).toContain('@Roles("ADMIN", "EMPLOYEE")');
    expect(controller).toContain('@Post("reservations")');
  });

  it("codifica la reserva condicional, expiración e idempotencia", () => {
    const service = read("services/inventory-service/src/inventory/inventory.service.ts");
    const migration = read("services/inventory-service/migrations/001_inventory_schema.sql");

    expect(service).toContain("AND (s.on_hand - s.reserved) >= $1");
    expect(service).toContain("pg_advisory_xact_lock");
    expect(service).toContain("releaseExpiredReservations");
    expect(service).toContain("OUT_OF_STOCK");
    expect(migration).toContain("reserved <= on_hand");
    expect(migration).toContain("UNIQUE (actor, idempotency_key)");
  });

  it("preserva las fronteras de datos sin una FK física hacia Catalog", () => {
    const migration = read("services/inventory-service/migrations/001_inventory_schema.sql");

    expect(migration).toContain("inventory_variant_snapshots");
    expect(migration).toContain("not a foreign key to");
    expect(migration).not.toMatch(/REFERENCES\s+catalog_/i);
    expect(existsSync(path.join(webRoot, "services/inventory-service/package-lock.json"))).toBe(true);
  });
});
