import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("Analytics y Chart.js de la fase 8", () => {
  it("aísla las proyecciones y consume eventos de Orders e Inventory de forma idempotente", () => {
    const compose = read("compose.yaml");
    const consumer = read("services/analytics-service/src/analytics/analytics.consumer.ts");
    const service = read("services/analytics-service/src/analytics/analytics.service.ts");
    const migration = read("services/analytics-service/migrations/001_analytics_projections.sql");

    expect(compose).toContain("analytics-service:");
    expect(compose).toContain("analytics-postgres:");
    expect(compose).toContain("analytics-internal:");
    expect(consumer).toContain('"order.completed.v1"');
    expect(consumer).toContain('"order.cancelled.v1"');
    expect(consumer).toContain('"inventory.stock.changed.v1"');
    expect(consumer).toContain("analytics.projections.v1");
    expect(migration).toContain("analytics_processed_events");
    expect(service).toContain("ON CONFLICT (event_id) DO NOTHING");
  });

  it("protege reportes Analytics por Gateway y por el guard ADMIN del servicio", () => {
    const kong = read("infra/kong/kong.yml.template");
    const controller = read("services/analytics-service/src/analytics/analytics.controller.ts");

    expect(kong).toContain("analytics-service");
    expect(kong).toContain("/analytics/");
    expect(controller).toContain('@Roles("ADMIN")');
    expect(controller).toContain('"sales/by-branch"');
    expect(controller).toContain('"products/top"');
    expect(controller).toContain('"ticket-average"');
  });

  it("carga el dashboard mediante el Gateway y muestra Chart.js con estados de reporte", () => {
    const source = read("src/lib/analytics/dashboard.server.ts");
    const route = read("src/app/api/dashboard/analytics/route.ts");
    const dashboard = read("src/components/analytics-dashboard.tsx");

    expect(source).toContain('request("/analytics/sales/today"');
    expect(source).not.toContain("analytics-postgres");
    expect(route).toContain('user.role !== "ADMIN"');
    expect(dashboard).toContain('from "react-chartjs-2"');
    expect(dashboard).toContain("Ventas por sucursal");
    expect(dashboard).toContain("Top productos");
    expect(dashboard).toContain("Analytics está temporalmente atrasado");
  });
});
