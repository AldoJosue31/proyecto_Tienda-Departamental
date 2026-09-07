import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("arquitectura de la fase 4", () => {
  it("aísla Pricing con su propio PostgreSQL y ruta de Gateway", () => {
    const compose = read("compose.yaml");
    const kong = read("infra/kong/kong.yml.template");
    const database = compose.slice(
      compose.indexOf("pricing-postgres:"),
      compose.indexOf("\n  postgres:"),
    );

    expect(compose).toContain("pricing-service:");
    expect(compose).toContain("pricing-postgres:");
    expect(compose).toContain("pricing-internal:");
    expect(compose).toContain("pricing_postgres_data:");
    expect(database).not.toContain("ports:");
    expect(kong).toContain("url: http://pricing-service:3004");
    expect(kong).toContain("name: pricing-quote");
    expect(kong).toContain("name: pricing-promotions");
  });

  it("deja quote disponible y restringe promociones a ADMIN", () => {
    const kong = read("infra/kong/kong.yml.template");
    const controller = read("services/pricing-service/src/pricing/pricing.controller.ts");
    const quote = kong.slice(kong.indexOf("name: pricing-quote"), kong.indexOf("name: pricing-promotions"));
    const promotions = kong.slice(kong.indexOf("name: pricing-promotions"));

    expect(quote).toContain("- GET");
    expect(quote).not.toContain("name: jwt");
    expect(promotions).toContain("name: jwt");
    expect(controller).toContain('@Roles("ADMIN")');
  });

  it("mantiene precio base, vigencia y estados de promoción en Pricing", () => {
    const service = read("services/pricing-service/src/pricing/pricing.service.ts");
    const migration = read("services/pricing-service/migrations/001_pricing_schema.sql");

    expect(service).toContain("p.ends_at > $1");
    expect(service).toContain("reconcilePromotionStates");
    expect(service).toContain("Math.max(0, basePrice - discountAmount)");
    expect(migration).toContain("'DRAFT'");
    expect(migration).toContain("'SCHEDULED'");
    expect(migration).toContain("'ACTIVE'");
    expect(migration).toContain("'EXPIRED'");
    expect(migration).not.toMatch(/REFERENCES\s+catalog_/i);
  });

  it("retira el handler local de reglas de precio", () => {
    expect(existsSync(path.join(webRoot, "src/app/api/admin/price-rules/route.ts"))).toBe(false);
  });
});
