import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("Pick & Pack y Logistics de la fase 9", () => {
  it("mantiene Logistics aislado, proyecta Orders de forma idempotente y publica el cambio", () => {
    const compose = read("compose.yaml");
    const migration = read("services/logistics-service/migrations/001_logistics_schema.sql");
    const consumer = read("services/logistics-service/src/shipments/shipments.consumer.ts");
    const service = read("services/logistics-service/src/shipments/shipments.service.ts");
    const outbox = read("services/logistics-service/src/events/outbox.service.ts");

    expect(compose).toContain("logistics-service:");
    expect(compose).toContain("logistics-postgres:");
    expect(compose).toContain("logistics-internal:");
    expect(migration).toContain("logistics_processed_events");
    expect(migration).toContain("logistics_shipment_transitions");
    expect(migration).toContain("logistics_outbox_events");
    expect(consumer).toContain('"order.completed.v1"');
    expect(consumer).toContain('"order.cancelled.v1"');
    expect(service).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(outbox).toContain('"shipment.status.changed.v1"');
  });

  it("protege los contratos de envíos por Gateway, Nest y el BFF", () => {
    const kong = read("infra/kong/kong.yml.template");
    const controller = read("services/logistics-service/src/shipments/shipments.controller.ts");
    const listRoute = read("src/app/api/operations/shipments/route.ts");
    const statusRoute = read("src/app/api/operations/shipments/[id]/status/route.ts");

    expect(kong).toContain("logistics-service");
    expect(kong).toContain("/shipments");
    expect(controller).toContain('@Roles("ADMIN", "EMPLOYEE")');
    expect(listRoute).toContain('user.role !== "ADMIN" && user.role !== "EMPLOYEE"');
    expect(statusRoute).toContain('user.role !== "ADMIN" && user.role !== "EMPLOYEE"');
  });

  it("presenta un Kanban actualizado por BFF sin exponer conexiones internas", () => {
    const source = read("src/lib/logistics/pick-pack.server.ts");
    const board = read("src/components/pick-pack-board.tsx");
    const page = read("src/app/(platform)/operations/page.tsx");

    expect(source).toContain('request("/shipments"');
    expect(source).not.toContain("logistics-postgres");
    expect(board).toContain("@tanstack/react-query");
    expect(board).toContain("Pendiente");
    expect(board).toContain("Empacando");
    expect(board).toContain("Enviado");
    expect(board).toContain("refetchInterval: 15_000");
    expect(page).toContain("PickPackBoard");
  });
});
